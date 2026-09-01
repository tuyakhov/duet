/**
 * A thin adapter over the WebMCP API so the rest of Duet never touches the
 * raw browser surface. Two implementations exist in the wild:
 *
 *  - `document.modelContext` — the current Chrome implementation
 *    (Chrome 149+, chrome://flags/#enable-webmcp-testing or the origin
 *    trial). `registerTool(descriptor, { signal })`, unregistration via
 *    AbortController.
 *
 *  - `navigator.modelContext` — the W3C proposal surface used by other
 *    runtimes and polyfills: `registerTool`/`unregisterTool` when present,
 *    otherwise `provideContext({ tools })` which replaces the full list.
 *
 * The adapter feature-detects, keeps a target set of tools in sync, and
 * normalizes results/errors into MCP content responses.
 */

export interface ToolContext {
  /**
   * Official human-in-the-loop hook when the runtime provides one
   * (`agent.requestUserInteraction` in the spec proposal). When absent the
   * tool simply awaits the in-page UI, which every surface supports because
   * `execute` may be async.
   */
  requestUserInteraction?: <T>(fn: () => Promise<T>) => Promise<T>
}

export interface ToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: { readOnlyHint?: boolean }
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown> | unknown
}

interface McpContent {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

export type WebMCPSurface = 'document' | 'navigator' | 'none'

type RawExecute = (args: Record<string, unknown>, extra?: unknown) => Promise<McpContent>

interface RawToolDescriptor {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: { readOnlyHint?: boolean }
  execute: RawExecute
  /** Some navigator implementations use `callback` naming from earlier drafts. */
  callback?: RawExecute
}

interface DocumentModelContext {
  registerTool(tool: RawToolDescriptor, options?: { signal?: AbortSignal }): unknown
}

interface NavigatorModelContext {
  registerTool?(tool: RawToolDescriptor): unknown
  unregisterTool?(name: string): unknown
  provideContext?(context: { tools: RawToolDescriptor[] }): unknown
}

function normalizeResult(value: unknown): McpContent {
  if (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as McpContent).content)
  ) {
    return value as McpContent
  }
  if (value === undefined || value === null) return { content: [] }
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return { content: [{ type: 'text', text }] }
}

function normalizeError(err: unknown): McpContent {
  const payload =
    err && typeof err === 'object' && 'code' in err
      ? {
          ok: false,
          error: {
            code: String((err as { code: unknown }).code),
            message: err instanceof Error ? err.message : String(err),
          },
        }
      : { ok: false, error: { code: 'INTERNAL', message: err instanceof Error ? err.message : String(err) } }
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }], isError: true }
}

function toContext(extra: unknown): ToolContext {
  if (
    extra &&
    typeof extra === 'object' &&
    typeof (extra as { requestUserInteraction?: unknown }).requestUserInteraction === 'function'
  ) {
    const agent = extra as { requestUserInteraction: <T>(fn: () => Promise<T>) => Promise<T> }
    return { requestUserInteraction: (fn) => agent.requestUserInteraction(fn) }
  }
  return {}
}

function wrapExecute(tool: ToolDef): RawExecute {
  return async (args: Record<string, unknown>, extra?: unknown) => {
    try {
      const result = await tool.execute(args ?? {}, toContext(extra))
      return normalizeResult(result)
    } catch (err) {
      return normalizeError(err)
    }
  }
}

function toRawDescriptor(tool: ToolDef): RawToolDescriptor {
  const execute = wrapExecute(tool)
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
    execute,
    callback: execute,
  }
}

export class WebMCPAdapter {
  readonly surface: WebMCPSurface
  private documentContext: DocumentModelContext | null = null
  private navigatorContext: NavigatorModelContext | null = null
  private controllers = new Map<string, AbortController>()
  private registered = new Map<string, ToolDef>()

  constructor(root: { document?: unknown; navigator?: unknown } = globalThis as never) {
    const doc = root.document as { modelContext?: DocumentModelContext } | undefined
    const nav = root.navigator as { modelContext?: NavigatorModelContext } | undefined
    if (doc?.modelContext && typeof doc.modelContext.registerTool === 'function') {
      this.surface = 'document'
      this.documentContext = doc.modelContext
    } else if (nav?.modelContext) {
      this.surface = 'navigator'
      this.navigatorContext = nav.modelContext
    } else {
      this.surface = 'none'
    }
  }

  get available(): boolean {
    return this.surface !== 'none'
  }

  get activeToolNames(): string[] {
    return [...this.registered.keys()]
  }

  /**
   * Make the browser's registered tool set exactly `tools`.
   * Unchanged tools (same name) are re-pointed at the new handler without
   * churn where the surface allows it.
   */
  syncTools(tools: ToolDef[]): void {
    if (!this.available) return
    const nextNames = new Set(tools.map((t) => t.name))

    if (this.surface === 'document') {
      for (const [name, controller] of this.controllers) {
        if (!nextNames.has(name)) {
          controller.abort()
          this.controllers.delete(name)
          this.registered.delete(name)
        }
      }
      for (const tool of tools) {
        if (this.controllers.has(tool.name)) {
          // Same tool name — handlers read live state, no re-registration needed.
          this.registered.set(tool.name, tool)
          continue
        }
        const controller = new AbortController()
        try {
          this.documentContext!.registerTool(toRawDescriptor(tool), { signal: controller.signal })
          this.controllers.set(tool.name, controller)
          this.registered.set(tool.name, tool)
        } catch (err) {
          console.warn(`[duet] failed to register tool ${tool.name}`, err)
        }
      }
      return
    }

    const ctx = this.navigatorContext!
    if (typeof ctx.registerTool === 'function' && typeof ctx.unregisterTool === 'function') {
      for (const name of this.registered.keys()) {
        if (!nextNames.has(name)) {
          try {
            ctx.unregisterTool(name)
          } catch (err) {
            console.warn(`[duet] failed to unregister tool ${name}`, err)
          }
          this.registered.delete(name)
        }
      }
      for (const tool of tools) {
        if (this.registered.has(tool.name)) {
          this.registered.set(tool.name, tool)
          continue
        }
        try {
          ctx.registerTool(toRawDescriptor(tool))
          this.registered.set(tool.name, tool)
        } catch (err) {
          console.warn(`[duet] failed to register tool ${tool.name}`, err)
        }
      }
      return
    }

    if (typeof ctx.provideContext === 'function') {
      // Contextual full-list rebuild — documented lifecycle for this surface.
      try {
        ctx.provideContext({ tools: tools.map(toRawDescriptor) })
        this.registered = new Map(tools.map((t) => [t.name, t]))
      } catch (err) {
        console.warn('[duet] provideContext failed', err)
      }
    }
  }

  /** Used by the dev harness and tests to invoke a registered tool directly. */
  async callRegistered(name: string, args: Record<string, unknown>): Promise<McpContent> {
    const tool = this.registered.get(name)
    if (!tool) {
      return normalizeError(new Error(`Tool "${name}" is not currently registered.`))
    }
    try {
      return normalizeResult(await tool.execute(args, {}))
    } catch (err) {
      return normalizeError(err)
    }
  }

  dispose(): void {
    if (this.surface === 'document') {
      for (const controller of this.controllers.values()) controller.abort()
      this.controllers.clear()
    } else if (this.surface === 'navigator' && this.navigatorContext) {
      const ctx = this.navigatorContext
      if (typeof ctx.unregisterTool === 'function') {
        for (const name of this.registered.keys()) {
          try {
            ctx.unregisterTool(name)
          } catch {
            // best effort
          }
        }
      } else if (typeof ctx.provideContext === 'function') {
        try {
          ctx.provideContext({ tools: [] })
        } catch {
          // best effort
        }
      }
    }
    this.registered.clear()
  }
}
