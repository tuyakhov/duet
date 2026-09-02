import { useMemo } from 'react'
import { useStudioStore } from '../state/store'
import { webmcpAdapter } from '../webmcp/controller'
import { computeToolNames } from '../webmcp/tools'
import { TRACK_COLORS } from './trackMeta'
import type { InstrumentId } from '../engine/types'

function chipMeta(name: string): { className: string; style?: React.CSSProperties } {
  if (name.startsWith('performance_')) return { className: 'tool-chip performance' }
  const instrument = (['lead', 'keys', 'drums', 'bass', 'pad'] as InstrumentId[]).find(
    (id) => name === `${id}_edit`,
  )
  if (instrument) {
    return {
      className: 'tool-chip instrument',
      style: { '--chip-color': TRACK_COLORS[instrument] } as React.CSSProperties,
    }
  }
  return { className: 'tool-chip' }
}

/**
 * Shows which WebMCP tools this page is currently exposing. It reports
 * runtime detection honestly — the page cannot know whether an agent is
 * actually connected, only what it offers one.
 */
export function CapabilityPanel() {
  const mode = useStudioStore((s) => s.mode)
  const composition = useStudioStore((s) => s.composition)

  const toolNames = useMemo(() => computeToolNames({ mode, composition }), [mode, composition])

  const available = webmcpAdapter.available

  return (
    <section className="side-panel" aria-label="Agent capabilities">
      <h3>
        Agent capabilities
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)' }}>
          {toolNames.length} tools
        </span>
      </h3>
      <div className="webmcp-status">
        <span className={`status-dot ${available ? 'on' : 'off'}`} />
        {available ? (
          <span>
            WebMCP runtime detected — these tools are live for your browser agent
          </span>
        ) : (
          <span>
            No WebMCP runtime detected. Use Chrome 149+ with{' '}
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>chrome://flags/#enable-webmcp-testing</code>{' '}
            enabled, or another WebMCP-capable browser.
          </span>
        )}
      </div>
      <div className="tool-chips">
        {toolNames.map((name) => {
          const meta = chipMeta(name)
          return (
            <span key={name} className={meta.className} style={meta.style}>
              {name}
            </span>
          )
        })}
      </div>
      {mode === 'compose' && (
        <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '10px 0 0', lineHeight: 1.5 }}>
          Adding an instrument exposes its editing tool. Entering Perform mode swaps this entire set for
          performance tools.
        </p>
      )}
    </section>
  )
}
