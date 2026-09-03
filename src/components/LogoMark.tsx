/**
 * The Duet mark: four equaliser bars. With `animated` the bars breathe like a
 * live level meter (pure CSS, paused for users who prefer reduced motion).
 */
export function LogoMark({ size = 22, animated = false }: { size?: number; animated?: boolean }) {
  return (
    <svg
      className={animated ? 'logo-mark logo-mark--live' : 'logo-mark'}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
    >
      <rect className="logo-bar logo-bar-1" x="10" y="30" width="7" height="16" rx="3.5" fill="#0a84ff" opacity="0.55" />
      <rect className="logo-bar logo-bar-2" x="21" y="20" width="7" height="26" rx="3.5" fill="#0a84ff" opacity="0.75" />
      <rect className="logo-bar logo-bar-3" x="32" y="12" width="7" height="34" rx="3.5" fill="#0a84ff" />
      <rect className="logo-bar logo-bar-4" x="43" y="24" width="7" height="22" rx="3.5" fill="#0a84ff" opacity="0.75" />
    </svg>
  )
}
