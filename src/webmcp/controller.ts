/**
 * Keeps the browser's registered WebMCP toolset in lockstep with the studio:
 * the mode and the instrument rack decide which tools exist. Adding a drum
 * machine registers drums_edit; entering Performance mode withdraws every
 * compose tool and registers the performance set.
 */
import { useStudioStore } from '../state/store'
import { WebMCPAdapter } from './adapter'
import { computeTools } from './tools'

export const webmcpAdapter = new WebMCPAdapter()

let unsubscribe: (() => void) | null = null

export function startWebMCP(): WebMCPAdapter {
  if (webmcpAdapter.available) {
    webmcpAdapter.syncTools(computeTools())
    unsubscribe = useStudioStore.subscribe(
      (s) => `${s.mode}|${s.composition.instruments.join(',')}`,
      () => webmcpAdapter.syncTools(computeTools()),
    )
  }
  installDevHarness()
  return webmcpAdapter
}

export function stopWebMCP(): void {
  unsubscribe?.()
  unsubscribe = null
  webmcpAdapter.dispose()
}

/**
 * Development-only harness: lets automated tests drive the exact same tool
 * handlers an agent would call. Not registered in production builds and
 * never simulates an agent in the UI.
 */
function installDevHarness() {
  if (!import.meta.env.DEV) return
  const harness = {
    surface: webmcpAdapter.surface,
    listTools: () => computeTools().map((t) => ({ name: t.name, description: t.description })),
    callTool: async (name: string, args: Record<string, unknown> = {}) => {
      const tool = computeTools().find((t) => t.name === name)
      if (!tool) {
        return { ok: false, error: { code: 'NOT_FOUND', message: `Tool "${name}" is not active right now.` } }
      }
      try {
        return await tool.execute(args, {})
      } catch (err) {
        const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : 'INTERNAL'
        return { ok: false, error: { code, message: err instanceof Error ? err.message : String(err) } }
      }
    },
  }
  ;(window as unknown as Record<string, unknown>).__duetHarness = harness
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => stopWebMCP())
}
