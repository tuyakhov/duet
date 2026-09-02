import { useStudioStore } from '../state/store'

/**
 * The contract's human-in-the-loop gate: an agent tried to edit the locked
 * melody, the tool call is paused, and this sheet shows exactly what would
 * change. The tool resumes only after the human decides.
 */
export function ApprovalModal() {
  const pending = useStudioStore((s) => s.pendingEdit)
  const resolve = useStudioStore((s) => s.resolveEditApproval)
  if (!pending) return null

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Approve agent edit">
      <div className="modal">
        <div className="modal-kicker">Musical Contract</div>
        <h2>{pending.title}</h2>
        <p>Your melody is locked. The agent's tool call is paused until you decide:</p>
        <pre className="approval-diff">{pending.description}</pre>
        <div className="modal-actions">
          <button className="btn ghost" onClick={() => resolve(false)}>
            Keep my melody
          </button>
          <button className="btn approve" onClick={() => resolve(true)}>
            Allow this change
          </button>
        </div>
      </div>
    </div>
  )
}
