import { describe, expect, it, vi } from 'vitest'
import { WebMCPAdapter, type ToolDef } from './adapter'

function tool(name: string, execute: ToolDef['execute'] = () => ({ ok: true })): ToolDef {
  return { name, description: `${name} description`, inputSchema: { type: 'object', properties: {} }, execute }
}

/** Chrome-style surface: document.modelContext.registerTool + AbortSignal. */
function chromeSurface() {
  const registered = new Map<string, { descriptor: { execute: (a: unknown, e?: unknown) => unknown }; signal?: AbortSignal }>()
  return {
    registered,
    root: {
      document: {
        modelContext: {
          registerTool(descriptor: { name: string; execute: (a: unknown, e?: unknown) => unknown }, options?: { signal?: AbortSignal }) {
            registered.set(descriptor.name, { descriptor, signal: options?.signal })
            options?.signal?.addEventListener('abort', () => registered.delete(descriptor.name))
          },
        },
      },
    },
  }
}

/** Spec-proposal surface: navigator.modelContext register/unregister. */
function navigatorSurface() {
  const registered = new Map<string, { execute: (a: unknown, e?: unknown) => unknown }>()
  return {
    registered,
    root: {
      navigator: {
        modelContext: {
          registerTool: (d: { name: string; execute: (a: unknown, e?: unknown) => unknown }) => registered.set(d.name, d),
          unregisterTool: (name: string) => registered.delete(name),
        },
      },
    },
  }
}

/** provideContext-only surface (full list replacement). */
function provideContextSurface() {
  const calls: Array<Array<{ name: string }>> = []
  return {
    calls,
    root: {
      navigator: {
        modelContext: {
          provideContext: (ctx: { tools: Array<{ name: string }> }) => calls.push(ctx.tools),
        },
      },
    },
  }
}

describe('feature detection', () => {
  it('prefers the Chrome document surface', () => {
    const chrome = chromeSurface()
    const adapter = new WebMCPAdapter({ ...chrome.root, navigator: navigatorSurface().root.navigator })
    expect(adapter.surface).toBe('document')
  })

  it('falls back to navigator, then to none', () => {
    expect(new WebMCPAdapter(navigatorSurface().root).surface).toBe('navigator')
    expect(new WebMCPAdapter({}).surface).toBe('none')
    expect(new WebMCPAdapter({}).available).toBe(false)
  })

  it('syncTools is a no-op without a surface', () => {
    const adapter = new WebMCPAdapter({})
    expect(() => adapter.syncTools([tool('a')])).not.toThrow()
    expect(adapter.activeToolNames).toEqual([])
  })
})

describe('document surface sync', () => {
  it('registers new tools and unregisters removed ones via AbortSignal', () => {
    const chrome = chromeSurface()
    const adapter = new WebMCPAdapter(chrome.root)

    adapter.syncTools([tool('a'), tool('b')])
    expect([...chrome.registered.keys()].sort()).toEqual(['a', 'b'])

    adapter.syncTools([tool('b'), tool('c')])
    expect([...chrome.registered.keys()].sort()).toEqual(['b', 'c'])
    expect(adapter.activeToolNames.sort()).toEqual(['b', 'c'])
  })

  it('does not re-register unchanged tool names', () => {
    const chrome = chromeSurface()
    const registerSpy = vi.spyOn(chrome.root.document.modelContext, 'registerTool')
    const adapter = new WebMCPAdapter(chrome.root)
    adapter.syncTools([tool('a')])
    adapter.syncTools([tool('a'), tool('b')])
    expect(registerSpy).toHaveBeenCalledTimes(2)
  })

  it('dispose aborts everything', () => {
    const chrome = chromeSurface()
    const adapter = new WebMCPAdapter(chrome.root)
    adapter.syncTools([tool('a'), tool('b')])
    adapter.dispose()
    expect(chrome.registered.size).toBe(0)
  })
})

describe('navigator surface sync', () => {
  it('uses registerTool/unregisterTool when available', () => {
    const nav = navigatorSurface()
    const adapter = new WebMCPAdapter(nav.root)
    adapter.syncTools([tool('a'), tool('b')])
    expect([...nav.registered.keys()].sort()).toEqual(['a', 'b'])
    adapter.syncTools([tool('b')])
    expect([...nav.registered.keys()]).toEqual(['b'])
  })

  it('rebuilds the full list through provideContext when that is all there is', () => {
    const surface = provideContextSurface()
    const adapter = new WebMCPAdapter(surface.root)
    adapter.syncTools([tool('a'), tool('b')])
    adapter.syncTools([tool('b')])
    expect(surface.calls).toHaveLength(2)
    expect(surface.calls[1].map((t) => t.name)).toEqual(['b'])
  })
})

describe('result and error normalization', () => {
  it('wraps structured results as MCP text content', async () => {
    const chrome = chromeSurface()
    const adapter = new WebMCPAdapter(chrome.root)
    adapter.syncTools([tool('a', () => ({ ok: true, message: 'hi' }))])
    const raw = chrome.registered.get('a')!.descriptor
    const result = (await raw.execute({}, undefined)) as { content: Array<{ type: string; text: string }> }
    expect(result.content[0].type).toBe('text')
    expect(JSON.parse(result.content[0].text)).toEqual({ ok: true, message: 'hi' })
  })

  it('turns thrown DuetErrors into isError responses with codes', async () => {
    const chrome = chromeSurface()
    const adapter = new WebMCPAdapter(chrome.root)
    adapter.syncTools([
      tool('fails', () => {
        const err = new Error('Audio is not enabled yet.') as Error & { code: string }
        err.code = 'AUDIO_PERMISSION_REQUIRED'
        throw err
      }),
    ])
    const raw = chrome.registered.get('fails')!.descriptor
    const result = (await raw.execute({}, undefined)) as { isError?: boolean; content: Array<{ text: string }> }
    expect(result.isError).toBe(true)
    const payload = JSON.parse(result.content[0].text)
    expect(payload.error.code).toBe('AUDIO_PERMISSION_REQUIRED')
  })

  it('passes the runtime agent hook through to the tool context', async () => {
    const chrome = chromeSurface()
    const adapter = new WebMCPAdapter(chrome.root)
    let sawHook = false
    adapter.syncTools([
      tool('interactive', async (_args, ctx) => {
        sawHook = typeof ctx.requestUserInteraction === 'function'
        return 'done'
      }),
    ])
    const raw = chrome.registered.get('interactive')!.descriptor
    await raw.execute({}, { requestUserInteraction: (fn: () => Promise<unknown>) => fn() })
    expect(sawHook).toBe(true)
  })
})
