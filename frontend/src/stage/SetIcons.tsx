/**
 * The Stage's icons (20×20, plan 45: soft gradients, a thin outline; components/GlossIcon.tsx): one per Set type
 * (SetTypeUI.icon), the Stage's controls (Stages, Actions, EFX), the Set bar's own buttons (eye, settings, edit, fold)
 * and the dice tray's (minimize, roll, clear, clear all).
 */
import { Gloss, tone, useGloss } from '../components/GlossIcon'

type Sized = { size?: number }

/** Actors Scene: two cards, fanned, a face on the front one. */
export const ActorsSceneIcon = ({ size }: Sized) => {
  const g = useGloss('blue', 'paper', 'gold')
  return (
    <Gloss defs={g.defs} size={size}>
      <rect x="2.6" y="4.2" width="8.2" height="11.4" rx="1.6" transform="rotate(-10 6.7 9.9)" {...g.blue} />
      <rect x="8.8" y="3.6" width="8.4" height="11.6" rx="1.6" transform="rotate(8 13 9.4)" {...g.paper} />
      <circle cx="13.1" cy="8" r="1.9" transform="rotate(8 13 9.4)" {...g.gold} />
      <path d="M10.6 13.2c.6-1.6 1.6-2.3 2.8-2.3s2.2.8 2.7 2.4" transform="rotate(8 13 9.4)" fill="none" stroke={tone('gold')} strokeWidth="1.1" />
    </Gloss>
  )
}

/** Map: a folded map with a pin. */
export const MapIcon = ({ size }: Sized) => {
  const g = useGloss('paper', 'green', 'red')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="M2 5.2 7 3.4l6 2 5-1.8v11.2L13 16.6l-6-2-5 1.8z" {...g.paper} />
      <path d="M7 3.4v11.2M13 5.4v11.2" stroke={tone('paper')} strokeWidth="0.9" fill="none" />
      <path d="M3.5 12.5c1.4-1.2 2.6-.4 3.5-1.6s2.4-2 3.6-.9" fill="none" stroke={tone('green', 1)} strokeWidth="1.2" />
      <path d="M13.6 10.6s-2.4-2.4-2.4-4.1a2.4 2.4 0 0 1 4.8 0c0 1.7-2.4 4.1-2.4 4.1z" {...g.red} />
      <circle cx="13.6" cy="6.5" r="0.85" fill="#fff" />
    </Gloss>
  )
}

/** Relationship graph: three linked nodes. */
export const GraphIcon = ({ size }: Sized) => {
  const g = useGloss('blue', 'gold', 'pink')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="M5 6.2 15 5M5 6.2l5 8.6M15 5l-5 9.8" stroke={tone('steel', 1)} strokeWidth="1.4" fill="none" />
      <circle cx="5" cy="6.2" r="2.7" {...g.blue} />
      <circle cx="15" cy="5" r="2.7" {...g.gold} />
      <circle cx="10" cy="14.8" r="2.7" {...g.pink} />
    </Gloss>
  )
}

/** Timeline: a line with events on it. */
export const TimelineIcon = ({ size }: Sized) => {
  const g = useGloss('steel', 'gold', 'blue', 'pink')
  return (
    <Gloss defs={g.defs} size={size}>
      <rect x="1.8" y="9" width="16.4" height="2" rx="1" {...g.steel} />
      <path d="M5.5 8V4.6M11 12v3.6M15.5 8V5.6" stroke={tone('steel', 1)} strokeWidth="1.3" fill="none" />
      <circle cx="5.5" cy="10" r="2.1" {...g.gold} />
      <circle cx="11" cy="10" r="2.1" {...g.blue} />
      <circle cx="15.5" cy="10" r="2.1" {...g.pink} />
    </Gloss>
  )
}

/** Desktop: a pinboard (a mural, a crime board): a whiteboard with two pictures pinned on it, a thread between them. */
export const DesktopIcon = ({ size }: Sized) => {
  const g = useGloss('wood', 'white', 'sky', 'green', 'red')
  return (
    <Gloss defs={g.defs} size={size}>
      <rect x="1.4" y="2.6" width="17.2" height="13.4" rx="1.6" {...g.wood} />
      <rect x="2.8" y="4" width="14.4" height="10.6" rx="0.8" {...g.white} />
      <path d="M8 16v2M12 16v2" stroke={tone('wood')} strokeWidth="1.3" />
      <rect x="4" y="5.2" width="5.4" height="4.6" transform="rotate(-6 6.7 7.5)" {...g.sky} strokeWidth={0.8} />
      <path d="M4.4 9.4 6 7.6l1.2 1.2 1-.9 1 1.3" transform="rotate(-6 6.7 7.5)" fill="none" stroke={tone('green', 1)} strokeWidth="0.9" />
      <rect x="10.6" y="8" width="5.2" height="5" transform="rotate(5 13.2 10.5)" {...g.green} strokeWidth={0.8} />
      <circle cx="13.2" cy="10.4" r="1.2" transform="rotate(5 13.2 10.5)" fill={tone('paper', 0)} />
      <path d="M6.6 5.4 13.2 8.2" stroke={tone('red', 1)} strokeWidth="0.8" fill="none" />
      <circle cx="6.6" cy="5.4" r="1" {...g.red} strokeWidth={0.6} />
      <circle cx="13.2" cy="8.2" r="1" {...g.red} strokeWidth={0.6} />
    </Gloss>
  )
}

/** Dice roller: a d20. */
export const DiceIcon = ({ size }: Sized) => {
  const g = useGloss('red', 'pink')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="M10 2 17.2 6.2v7.6L10 18 2.8 13.8V6.2z" {...g.red} />
      <path d="M10 5.2 13.8 12H6.2z" {...g.pink} />
      <path d="M10 2v3.2M2.8 6.2l3.4 5.8M17.2 6.2l-3.4 5.8M6.2 12 10 18l3.8-6M2.8 13.8 6.2 12M17.2 13.8 13.8 12" stroke={tone('red')} strokeWidth="0.8" fill="none" />
    </Gloss>
  )
}

/** EFX: a sparkle and a small star. */
export const EfxIcon = ({ size }: Sized) => {
  const g = useGloss('purple', 'pink')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="M9 2c.7 3.7 2.3 5.3 6 6-3.7.7-5.3 2.3-6 6-.7-3.7-2.3-5.3-6-6 3.7-.7 5.3-2.3 6-6z" {...g.purple} />
      <path d="M15 12.2c.3 1.6 1 2.3 2.6 2.6-1.6.3-2.3 1-2.6 2.6-.3-1.6-1-2.3-2.6-2.6 1.6-.3 2.3-1 2.6-2.6z" {...g.pink} />
    </Gloss>
  )
}

/** The Stages control: a screen with the live dot. */
export const StagesIcon = ({ size }: Sized) => {
  const g = useGloss('slate', 'sky', 'red')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="M8 14.5h4l.8 2.6H7.2z" {...g.slate} />
      <rect x="2" y="3.4" width="16" height="11" rx="1.8" {...g.slate} />
      <rect x="3.5" y="4.9" width="13" height="8" rx="0.8" {...g.sky} />
      <circle cx="14.2" cy="7.3" r="1.5" {...g.red} />
    </Gloss>
  )
}

/** The Actions control: a lightning bolt. */
export const ActionsIcon = ({ size }: Sized) => {
  const g = useGloss('gold')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="M11.8 1.6 4 11.2h5l-1.6 7.2 8.6-10.2h-5.2z" {...g.gold} />
      <path d="M10.4 4.6 7.4 8.8" stroke="#fff6c8" strokeWidth="1" opacity="0.8" fill="none" />
    </Gloss>
  )
}

/** Pause the Stage (plan 58): two bars; paused, the play triangle to resume. */
export const PauseIcon = ({ paused, size = 18 }: Sized & { paused: boolean }) => {
  const g = useGloss(paused ? 'green' : 'gold')
  const fill = paused ? g.green : g.gold
  return (
    <Gloss defs={g.defs} size={size}>
      {paused ? <path d="M6 3.6 16.2 10 6 16.4z" {...fill} strokeLinejoin="round" />
        : <><rect x="4.6" y="3.6" width="3.8" height="12.8" rx="1.2" {...fill} /><rect x="11.6" y="3.6" width="3.8" height="12.8" rx="1.2" {...fill} /></>}
    </Gloss>
  )
}

/** The DM's player view (plan 59): an eye in a screen. */
export const PlayerViewIcon = ({ size = 18 }: Sized) => {
  const g = useGloss('blue', 'white', 'dark')
  return (
    <Gloss defs={g.defs} size={size}>
      <rect x="1.8" y="3.2" width="16.4" height="11.6" rx="1.8" {...g.blue} />
      <path d="M4.6 9c1.6-2.3 3.4-3.4 5.4-3.4s3.8 1.1 5.4 3.4c-1.6 2.3-3.4 3.4-5.4 3.4S6.2 11.3 4.6 9z" {...g.white} />
      <circle cx="10" cy="9" r="1.7" {...g.dark} />
      <path d="M7 17.4h6" stroke="#9fb4c8" strokeWidth="1.4" strokeLinecap="round" />
    </Gloss>
  )
}

/** Panels (plan 60): two framed panels and a line. */
export const PanelsIcon = ({ size }: Sized) => {
  const g = useGloss('blue', 'gold')
  return (
    <Gloss defs={g.defs} size={size}>
      <rect x="2" y="2.6" width="9" height="8" rx="2" {...g.blue} />
      <rect x="12.4" y="6" width="5.8" height="11.4" rx="1.6" {...g.gold} />
      <path d="M2.4 15.6h7.6" stroke="#cfe3f0" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 2" />
    </Gloss>
  )
}

/** A Set of an unknown type. */
export const SetIcon = ({ size }: Sized) => {
  const g = useGloss('steel', 'blue')
  return (
    <Gloss defs={g.defs} size={size}>
      <rect x="2.6" y="3.6" width="14.8" height="12.8" rx="2" {...g.steel} />
      <rect x="2.6" y="3.6" width="14.8" height="3.6" rx="1.6" {...g.blue} />
    </Gloss>
  )
}

/** The classic gear: eight teeth around a hole. */
const GEAR = (() => {
  const points: string[] = []
  const teeth = 8
  for (let i = 0; i < teeth * 4; i++) {
    const a = (i / (teeth * 4)) * Math.PI * 2 - Math.PI / 2 + Math.PI / (teeth * 4)
    const r = i % 4 < 2 ? 8.4 : 6.4
    points.push(`${(10 + Math.cos(a) * r).toFixed(2)} ${(10 + Math.sin(a) * r).toFixed(2)}`)
  }
  return `M${points.join(' L')}Z`
})()

export const GearIcon = ({ size = 18 }: Sized) => {
  const g = useGloss('steel', 'slate')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d={GEAR} {...g.steel} strokeLinejoin="round" />
      <circle cx="10" cy="10" r="2.6" {...g.slate} />
    </Gloss>
  )
}

/** Put away / show (the Set bar's eye): open, or shut and struck through. */
export const StageEyeIcon = ({ open, size = 18 }: Sized & { open: boolean }) => {
  const g = useGloss('white', 'blue', 'dark')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="M1.6 10S4.6 4.4 10 4.4 18.4 10 18.4 10 15.4 15.6 10 15.6 1.6 10 1.6 10z" {...(open ? g.white : g.dark)} />
      {open ? <><circle cx="10" cy="10" r="3.2" {...g.blue} /><circle cx="10" cy="10" r="1.2" fill={tone('dark', 2)} /><circle cx="11" cy="8.9" r="0.7" fill="#fff" /></>
        : <path d="M3.6 16.4 16.4 3.6" stroke={tone('red', 1)} strokeWidth="2" />}
    </Gloss>
  )
}

/** Edit (the full editor): a pencil. */
export const PencilIcon = ({ size = 18 }: Sized) => {
  const g = useGloss('gold', 'pink', 'paper')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="M13.2 3.2 16.8 6.8 7.4 16.2 3.8 12.6z" {...g.gold} />
      <path d="M13.2 3.2l1.4-1.4c.6-.6 1.4-.6 2 0l1.6 1.6c.6.6.6 1.4 0 2L16.8 6.8z" {...g.pink} />
      <path d="M3.8 12.6 7.4 16.2 2.4 17.6z" {...g.paper} />
      <path d="M2.4 17.6l1.6-.45-1.15-1.15z" fill={tone('dark', 2)} />
    </Gloss>
  )
}

/** Fold a Set's other toolbars away (open: shown). */
export const FoldIcon = ({ open, size = 18 }: Sized & { open: boolean }) => {
  const g = useGloss('steel', 'blue')
  return (
    <Gloss defs={g.defs} size={size}>
      <rect x="3" y="3.5" width="14" height="13" rx="2" {...g.steel} />
      {open ? <path d="M6.5 8.5h7M6.5 11.5h4" stroke={tone('blue', 1)} strokeWidth="1.6" fill="none" />
        : <path d="M7 10h6" stroke={tone('slate', 1)} strokeWidth="1.6" strokeDasharray="1.5 2" fill="none" />}
    </Gloss>
  )
}

const Chevron = ({ size = 18, up }: Sized & { up: boolean }) => {
  const g = useGloss('steel')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d={up ? 'M3.6 12.4 10 6l6.4 6.4-1.9 1.9L10 9.8l-4.5 4.5z' : 'M3.6 7.6 10 14l6.4-6.4-1.9-1.9L10 10.2 5.5 5.7z'} {...g.steel} />
    </Gloss>
  )
}
export const MinimizeIcon = ({ size }: Sized) => <Chevron size={size} up={false} />
export const ExpandIcon = ({ size }: Sized) => <Chevron size={size} up />

/** Roll: a d6 seen from a corner (isometric), its three faces lit differently. */
export const RollIcon = ({ size = 18 }: Sized) => {
  const g = useGloss('pink', 'red')
  const pip = (x: number, y: number, k: number) => <circle key={`${x}-${y}`} cx={x} cy={y} r={0.85} fill="#fff" opacity={k} />
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="M10 2.2 16.8 6.1 10 10 3.2 6.1z" {...g.pink} />
      <path d="M3.2 6.1 10 10v7.8L3.2 13.9z" fill={tone('red', 1)} stroke={tone('red')} strokeWidth={0.9} />
      <path d="M10 10l6.8-3.9v7.8L10 17.8z" fill={tone('red', 2)} stroke={tone('red')} strokeWidth={0.9} />
      {pip(10, 6.1, 1)}
      {[pip(5.2, 9.4, 0.95), pip(8, 14.4, 0.95)]}
      {[pip(11.7, 10.9, 0.85), pip(13.4, 12, 0.85), pip(15.1, 13.1, 0.85)]}
    </Gloss>
  )
}

/** Clear your row. */
export const ClearIcon = ({ size = 18 }: Sized) => {
  const g = useGloss('red')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="M5.2 3.4 10 8.2l4.8-4.8 1.8 1.8L11.8 10l4.8 4.8-1.8 1.8-4.8-4.8-4.8 4.8-1.8-1.8L8.2 10 3.4 5.2z" {...g.red} />
    </Gloss>
  )
}

/** Clear every row (the DM): a bin. */
export const ClearAllIcon = ({ size = 18 }: Sized) => {
  const g = useGloss('steel', 'red')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="M5 6.4h10l-.9 10.2c-.1.8-.7 1.4-1.5 1.4H7.4c-.8 0-1.4-.6-1.5-1.4z" {...g.steel} />
      <rect x="3.4" y="4" width="13.2" height="2.6" rx="1" {...g.red} />
      <path d="M8 2.6h4v1.4H8z" {...g.red} />
      <path d="M8.4 9v6M11.6 9v6" stroke={tone('steel')} strokeWidth="1.1" fill="none" />
    </Gloss>
  )
}
