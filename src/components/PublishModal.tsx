import { useEffect, useState } from 'react'
import { useStudioStore } from '../state/store'

/**
 * The human-approval gate for publishing. Opens while a studio_publish tool
 * call (or the human's own Share click) is paused waiting; the pending tool
 * only resumes when the human approves or cancels here.
 */
export function PublishModal() {
  const pending = useStudioStore((s) => s.pendingPublish)
  const resolvePublish = useStudioStore((s) => s.resolvePublish)
  const [title, setTitle] = useState('')

  useEffect(() => {
    if (pending) setTitle(pending.suggestedTitle)
  }, [pending])

  if (!pending) return null

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Approve publishing">
      <div className="modal">
        <div className="modal-kicker">
          {pending.requestedBy === 'agent' ? 'Your agent wants to publish' : 'Publish this duet'}
        </div>
        <h2>Ready to share?</h2>
        <p>
          Duet will encode the current composition — every note, pattern, chord and mixer setting — into a
          remixable link. No account, no upload: the whole song travels inside the URL. Give it a title:
        </p>
        <input
          className="modal-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && resolvePublish(title)}
          maxLength={80}
          autoFocus
          aria-label="Song title"
        />
        <div className="modal-actions">
          <button className="btn ghost" onClick={() => resolvePublish(null)}>
            Cancel
          </button>
          <button className="btn approve" onClick={() => resolvePublish(title)}>
            Approve &amp; create link
          </button>
        </div>
      </div>
    </div>
  )
}
