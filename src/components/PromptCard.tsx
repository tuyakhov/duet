import { useRef, useState } from 'react'
import { AGENT_PROMPT } from '../state/actions'
import { copyText, selectContents } from '../state/clipboard'

type CopyState = 'idle' | 'copied' | 'failed'

export function PromptCard({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<CopyState>('idle')
  const textRef = useRef<HTMLSpanElement>(null)

  const copy = async () => {
    const ok = await copyText(AGENT_PROMPT)
    setState(ok ? 'copied' : 'failed')
    // Whether or not the clipboard cooperated, leave the text selected so a
    // manual ⌘C / Ctrl+C works immediately.
    if (!ok) selectContents(textRef.current)
    setTimeout(() => setState('idle'), ok ? 1600 : 3200)
  }

  return (
    <section className={compact ? 'welcome-prompt' : 'side-panel'} aria-label="Example agent prompt">
      {!compact && <h3>Ask your agent</h3>}
      <div className="prompt-box">
        “<span ref={textRef}>{AGENT_PROMPT}</span>”
        <button className={`prompt-copy ${state}`} onClick={copy}>
          {state === 'copied' ? '✓ copied' : state === 'failed' ? 'selected — press ⌘C' : 'copy'}
        </button>
      </div>
    </section>
  )
}
