import { humanActions } from '../state/actions'
import { useStudioStore } from '../state/store'

function Chip({
  on,
  onClick,
  children,
  title,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
  title?: string
}) {
  return (
    <button className={`contract-chip ${on ? 'on' : ''}`} onClick={onClick} title={title} aria-pressed={on}>
      {children}
    </button>
  )
}

function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: readonly T[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="contract-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o}
          role="radio"
          aria-checked={value === o}
          className={value === o ? 'active' : ''}
          onClick={() => onChange(o)}
        >
          {o === 'laidback' ? 'laid-back' : o}
        </button>
      ))}
    </div>
  )
}

/**
 * The Musical Contract: the human's terms for the collaboration. Everything
 * here is live shared state that the WebMCP tools enforce on the agent.
 */
export function ContractPanel() {
  const contract = useStudioStore((s) => s.composition.contract)
  const humanize = useStudioStore((s) => s.composition.humanize)
  const mode = useStudioStore((s) => s.mode)
  if (mode === 'performance') return null

  const set = humanActions.setContract

  return (
    <section className="side-panel contract-panel" aria-label="Musical Contract">
      <h3>Musical Contract</h3>

      <div className="contract-row">
        <span className="contract-label">Melody</span>
        <Chip
          on={contract.melodyLocked}
          onClick={() => set({ melodyLocked: !contract.melodyLocked })}
          title="When locked, agent edits to your melody pause and ask you first"
        >
          {contract.melodyLocked ? '🔒 Human — locked' : '🔓 Open to the agent'}
        </Chip>
      </div>

      <div className="contract-row">
        <span className="contract-label">Agent may edit</span>
        <div className="contract-chiprow">
          {(['keys', 'drums', 'bass', 'pad', 'mix'] as const).map((k) => (
            <Chip
              key={k}
              on={contract.agentMayEdit[k]}
              onClick={() => set({ agentMayEdit: { [k]: !contract.agentMayEdit[k] } })}
            >
              {k}
            </Chip>
          ))}
        </div>
      </div>

      {!contract.melodyLocked && (
        <div className="contract-row">
          <span className="contract-label">Preserve</span>
          <div className="contract-chiprow">
            {(['pitch', 'timing', 'velocity'] as const).map((k) => (
              <Chip key={k} on={contract.preserve[k]} onClick={() => set({ preserve: { [k]: !contract.preserve[k] } })}>
                {k}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <div className="contract-row">
        <span className="contract-label">Groove</span>
        <Seg value={contract.feel} options={['straight', 'swung', 'laidback'] as const} onChange={humanActions.setFeel} label="Groove feel" />
      </div>

      <div className="contract-row">
        <span className="contract-label">Density</span>
        <Seg
          value={contract.density}
          options={['sparse', 'balanced', 'full'] as const}
          onChange={(density) => set({ density })}
          label="Density"
        />
      </div>

      <div className="contract-row">
        <span className="contract-label">Harmony</span>
        <Seg
          value={contract.harmony}
          options={['safe', 'colourful', 'adventurous'] as const}
          onChange={(harmony) => set({ harmony })}
          label="Harmonic freedom"
        />
      </div>

      <div className="contract-row">
        <span className="contract-label">
          Max intensity <em>{Math.round(contract.maxIntensity * 100)}%</em>
        </span>
        <input
          type="range"
          className="volume-slider"
          style={{ width: 110 }}
          min={0}
          max={1}
          step={0.05}
          value={contract.maxIntensity}
          onChange={(e) => set({ maxIntensity: Number(e.target.value) })}
          aria-label="Maximum intensity"
        />
      </div>

      <div className="contract-row">
        <span className="contract-label">
          Humanize <em>{Math.round(humanize * 100)}%</em>
        </span>
        <input
          type="range"
          className="volume-slider"
          style={{ width: 110 }}
          min={0}
          max={1}
          step={0.05}
          value={humanize}
          onChange={(e) => humanActions.setHumanize(Number(e.target.value))}
          aria-label="Humanize"
          title="Deterministic micro-timing and velocity variation"
        />
      </div>

      <div className="contract-row">
        <span className="contract-label">Locks</span>
        <div className="contract-chiprow">
          <Chip on={contract.lockTempo} onClick={() => set({ lockTempo: !contract.lockTempo })}>
            tempo
          </Chip>
          <Chip on={contract.lockKey} onClick={() => set({ lockKey: !contract.lockKey })}>
            key
          </Chip>
        </div>
      </div>

      <p className="contract-note">
        These terms are live state — every agent tool call is checked against them.
      </p>
    </section>
  )
}
