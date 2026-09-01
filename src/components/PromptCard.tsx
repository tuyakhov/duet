import { useState } from 'react'
import { AGENT_PROMPT } from '../state/actions'

export function PromptCard({ compact = false }: { compact?: boolean }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(AGENT_PROMPT)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard unavailable — the text is selectable.
    }
  }

  return (
    <section className={compact ? 'welcome-prompt' : 'side-panel'} aria-label="Example agent prompt">
      {!compact && <h3>Ask your agent</h3>}
      <div className="prompt-box">
        “{AGENT_PROMPT}”
        <button className="prompt-copy" onClick={copy}>
          {copied ? '✓ copied' : 'copy'}
        </button>
      </div>
    </section>
  )
}
