/** An eye, open or struck through. */
export default function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="eye-icon">
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" fill={open ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" />
      {!open && <path d="M4 20 L20 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  )
}
