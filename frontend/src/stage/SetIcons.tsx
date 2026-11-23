/**
 * Line icons (20×20, currentColor) for the Set bar and Set controls: one per Set type (SetTypeUI.icon) and the bar's
 * own buttons (settings, fold) and the dice tray's (minimize, roll, clear, clear all).
 */
import type { ReactNode } from 'react'

function Icon({ children, size = 20, label }: { children: ReactNode; size?: number; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"
      strokeLinejoin="round" aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}>
      {children}
    </svg>
  )
}

/** Actors Scene: two cards, fanned. */
export const ActorsSceneIcon = () => (
  <Icon>
    <rect x="3" y="4.5" width="8" height="11" rx="1.5" transform="rotate(-9 7 10)" />
    <rect x="9" y="4" width="8" height="11" rx="1.5" transform="rotate(8 13 9.5)" />
    <circle cx="13" cy="8.2" r="1.6" transform="rotate(8 13 9.5)" />
  </Icon>
)

/** Map: a folded map with a pin. */
export const MapIcon = () => (
  <Icon>
    <path d="M2.5 5.2 7 3.5l6 2 4.5-1.7v11L13 16.5l-6-2-4.5 1.7z" />
    <path d="M7 3.5v11M13 5.5v11" />
  </Icon>
)

/** Relationship graph: three linked nodes. */
export const GraphIcon = () => (
  <Icon>
    <circle cx="5" cy="6" r="2.2" /><circle cx="15" cy="5" r="2.2" /><circle cx="10" cy="15" r="2.2" />
    <path d="M7.1 5.8h5.7M6.1 8l2.8 5M14 7l-3 6" />
  </Icon>
)

/** Timeline: a line with events on it. */
export const TimelineIcon = () => (
  <Icon>
    <path d="M2.5 10h15" />
    <circle cx="5.5" cy="10" r="1.6" /><circle cx="11" cy="10" r="1.6" /><circle cx="15.5" cy="10" r="1.6" />
    <path d="M5.5 8.4V5M11 11.6V15M15.5 8.4V6" />
  </Icon>
)

/** Desktop: a desk with a sheet and a card on it. */
export const DesktopIcon = () => (
  <Icon>
    <path d="M2 14.5h16M4 14.5V17M16 14.5V17" />
    <rect x="4" y="6" width="6" height="7.5" rx="0.8" transform="rotate(-6 7 9.8)" />
    <rect x="11" y="7.5" width="5" height="6" rx="0.8" transform="rotate(7 13.5 10.5)" />
  </Icon>
)

/** Dice roller: a d20-ish die. */
export const DiceIcon = () => (
  <Icon>
    <path d="M10 2.5 17 6.5v7L10 17.5 3 13.5v-7z" />
    <path d="M10 2.5 6.5 10.5h7zM3 6.5l3.5 4M17 6.5l-3.5 4M6.5 10.5 10 17.5l3.5-7" />
  </Icon>
)

/** EFX: a sparkle. */
export const EfxIcon = () => (
  <Icon>
    <path d="M10 2.5c.6 3.4 2.1 4.9 5.5 5.5-3.4.6-4.9 2.1-5.5 5.5-.6-3.4-2.1-4.9-5.5-5.5 3.4-.6 4.9-2.1 5.5-5.5z" />
    <path d="M15.5 13v4M13.5 15h4" />
  </Icon>
)

/** A Set of an unknown type. */
export const SetIcon = () => <Icon><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M3 7.5h14" /></Icon>

export const GearIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <circle cx="10" cy="10" r="2.6" />
    <path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6" />
  </Icon>
)

/** Fold a Set's other toolbars away (open: shown). */
export const FoldIcon = ({ open, size = 18 }: { open: boolean; size?: number }) => (
  <Icon size={size}>
    <rect x="3" y="3.5" width="14" height="13" rx="2" />
    {open ? <path d="M6.5 8.5h7M6.5 11.5h4" /> : <path d="M7 10h6" strokeDasharray="1.5 2" />}
  </Icon>
)

export const MinimizeIcon = ({ size = 18 }: { size?: number }) => <Icon size={size}><path d="M5 12.5 10 7.5l5 5" transform="rotate(180 10 10)" /></Icon>
export const ExpandIcon = ({ size = 18 }: { size?: number }) => <Icon size={size}><path d="M5 12.5 10 7.5l5 5" /></Icon>
export const RollIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <rect x="3.5" y="3.5" width="13" height="13" rx="3" transform="rotate(-12 10 10)" />
    <circle cx="7.6" cy="8" r="0.9" fill="currentColor" /><circle cx="12.4" cy="12" r="0.9" fill="currentColor" /><circle cx="10" cy="10" r="0.9" fill="currentColor" />
  </Icon>
)
/** Clear your row. */
export const ClearIcon = ({ size = 18 }: { size?: number }) => <Icon size={size}><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" /></Icon>
/** Clear every row (the DM). */
export const ClearAllIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M4 6h12M8 6V4.5h4V6M5.5 6l.8 10h7.4l.8-10" />
    <path d="M8.5 9v4.5M11.5 9v4.5" />
  </Icon>
)
