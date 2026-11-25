/** The map tools' icons (plan 45), in the Stage's icon style (components/GlossIcon.tsx). */
import { Gloss, tone, useGloss } from '../../components/GlossIcon'
export { PencilIcon } from '../../stage/SetIcons'

type Sized = { size?: number }

/** Grab attention: a bullseye. */
export const BullseyeIcon = ({ size }: Sized) => {
  const g = useGloss('red', 'white')
  return (
    <Gloss defs={g.defs} size={size}>
      <circle cx="10" cy="10" r="8.2" {...g.red} />
      <circle cx="10" cy="10" r="5.6" {...g.white} />
      <circle cx="10" cy="10" r="3" {...g.red} />
      <circle cx="10" cy="10" r="1" fill="#fff" />
    </Gloss>
  )
}

/** Selection: the pointer arrow. */
export const ArrowIcon = ({ size }: Sized) => {
  const g = useGloss('white')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="M4.6 2.4 15.2 11l-4.6.5 2.7 5.2-2.2 1.1-2.7-5.2L5 15.6z" {...g.white} strokeWidth={1.1} />
    </Gloss>
  )
}

/** Move: four arrows. */
export const MoveIcon = ({ size }: Sized) => {
  const g = useGloss('blue')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="M10 1.6 13 4.8h-2v4.2h4.2v-2l3.2 3-3.2 3v-2H11v4.2h2L10 18.4 7 15.2h2V11H4.8v2L1.6 10l3.2-3v2H9V4.8H7z" {...g.blue} />
    </Gloss>
  )
}

/** Highlight: a lit tile. */
export const HighlightIcon = ({ size }: Sized) => {
  const g = useGloss('gold', 'slate')
  return (
    <Gloss defs={g.defs} size={size}>
      <rect x="2.2" y="10.6" width="15.6" height="6.8" rx="1.2" {...g.slate} />
      <path d="M6.4 11.6h7.2l-1.2 4.8H7.6z" fill={tone('gold', 0)} opacity="0.9" />
      <path d="M10 1.8c.5 2.6 1.6 3.7 4.2 4.2-2.6.5-3.7 1.6-4.2 4.2-.5-2.6-1.6-3.7-4.2-4.2 2.6-.5 3.7-1.6 4.2-4.2z" {...g.gold} />
    </Gloss>
  )
}

const CLOUD = 'M5.6 16.2a3.6 3.6 0 0 1-.5-7.2 4.8 4.8 0 0 1 9.2-1.4 3.4 3.4 0 0 1 .6 6.7 2.9 2.9 0 0 1-1.2 1.9z'

/** Fog: a cloud. */
export const CloudIcon = ({ size, dark = false }: Sized & { dark?: boolean }) => {
  const g = useGloss('white', 'slate')
  return <Gloss defs={g.defs} size={size}><path d={CLOUD} {...(dark ? g.slate : g.white)} /></Gloss>
}

/** Fog, Reveal (visible): a sun. */
export const SunIcon = ({ size }: Sized) => {
  const g = useGloss('gold')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="M10 1.6v2.6M10 15.8v2.6M1.6 10h2.6M15.8 10h2.6M4 4l1.8 1.8M14.2 14.2 16 16M4 16l1.8-1.8M14.2 5.8 16 4" stroke={tone('gold', 1)} strokeWidth="1.7" />
      <circle cx="10" cy="10" r="4.4" {...g.gold} />
    </Gloss>
  )
}

/** Fog, Known (dimmed): a moon. */
export const MoonIcon = ({ size }: Sized) => {
  const g = useGloss('sky')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="M13.8 15.6A7 7 0 0 1 8.2 2.6a6.2 6.2 0 1 0 9.2 8.6 7 7 0 0 1-3.6 4.4z" {...g.sky} />
    </Gloss>
  )
}

/** Links: two chain links. */
export const ChainIcon = ({ size }: Sized) => {
  const g = useGloss('steel')
  const link = (d: string) => (
    <>
      <path d={d} fill="none" stroke={tone('steel')} strokeWidth="3.6" />
      <path d={d} fill="none" stroke={g.steel.fill} strokeWidth="2.2" />
    </>
  )
  return (
    <Gloss defs={g.defs} size={size}>
      {link('M8.6 11.4 7 13a2.6 2.6 0 0 1-3.7-3.7l2.8-2.8a2.6 2.6 0 0 1 3.7 0')}
      {link('M11.4 8.6 13 7a2.6 2.6 0 0 1 3.7 3.7l-2.8 2.8a2.6 2.6 0 0 1-3.7 0')}
    </Gloss>
  )
}

/** Tokens: a stick figure. */
export const FigureIcon = ({ size }: Sized) => {
  const g = useGloss('blue', 'skin')
  const limbs = 'M10 7.4v5.4M10 12.8l-3 4.8M10 12.8l3 4.8M5.2 9.2l4.8.6 4.8-.6'
  return (
    <Gloss defs={g.defs} size={size}>
      <path d={limbs} fill="none" stroke={tone('blue')} strokeWidth="3.4" />
      <path d={limbs} fill="none" stroke={g.blue.fill} strokeWidth="2" />
      <circle cx="10" cy="4.4" r="2.7" {...g.skin} />
    </Gloss>
  )
}

/** Paths: a road going off into the distance. */
export const RoadIcon = ({ size }: Sized) => {
  const g = useGloss('green', 'slate')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="M1.6 18.2 8.4 2.6h3.2l6.8 15.6z" {...g.green} />
      <path d="M4.2 18.2 9 2.8h2l4.8 15.4z" {...g.slate} />
      <path d="M10 4.2v2M10 8.6v2.6M10 13.6v3.4" stroke={tone('gold', 0)} strokeWidth="1.4" />
    </Gloss>
  )
}

/** Regions: a flag. */
export const FlagIcon = ({ size }: Sized) => {
  const g = useGloss('wood', 'red')
  return (
    <Gloss defs={g.defs} size={size}>
      <rect x="3.4" y="1.8" width="2" height="16.6" rx="1" {...g.wood} />
      <path d="M5.4 3c3-1.4 5.2 1.2 8.6 0 .9-.3 1.6-.3 2.2 0v7.6c-.6-.3-1.3-.3-2.2 0-3.4 1.2-5.6-1.4-8.6 0z" {...g.red} />
    </Gloss>
  )
}

/** Labels: a pin. */
export const PinIcon = ({ size }: Sized) => {
  const g = useGloss('red')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="M10 18.4s-5.8-5.6-5.8-9.8a5.8 5.8 0 0 1 11.6 0c0 4.2-5.8 9.8-5.8 9.8z" {...g.red} />
      <circle cx="10" cy="8.4" r="2.2" fill="#fff" />
    </Gloss>
  )
}

/** Ping: a pin with waves around its point. */
export const PingIcon = ({ size }: Sized) => {
  const g = useGloss('gold')
  return (
    <Gloss defs={g.defs} size={size}>
      <ellipse cx="10" cy="16.4" rx="6.6" ry="2" fill="none" stroke={tone('gold', 1)} strokeWidth="1.2" />
      <path d="M10 16.2s-4.4-4.2-4.4-7.6a4.4 4.4 0 0 1 8.8 0c0 3.4-4.4 7.6-4.4 7.6z" {...g.gold} />
      <circle cx="10" cy="8.6" r="1.7" fill="#fff" />
    </Gloss>
  )
}

/** The list of a kind's things. */
export const ListIcon = ({ size }: Sized) => {
  const g = useGloss('steel', 'gold')
  return (
    <Gloss defs={g.defs} size={size}>
      {[4.4, 9.2, 14].map((y) => (
        <g key={y}>
          <circle cx="3.8" cy={y + 0.9} r="1.5" {...g.gold} />
          <rect x="7" y={y} width="11" height="1.9" rx="0.95" {...g.steel} />
        </g>
      ))}
    </Gloss>
  )
}

/** Add one. */
export const PlusIcon = ({ size }: Sized) => {
  const g = useGloss('green')
  return <Gloss defs={g.defs} size={size}><path d="M8.5 3h3v5.5H17v3h-5.5V17h-3v-5.5H3v-3h5.5z" {...g.green} /></Gloss>
}

/** Paint a region, remove: minus. */
export const MinusIcon = ({ size }: Sized) => {
  const g = useGloss('red')
  return <Gloss defs={g.defs} size={size}><rect x="3" y="8.5" width="14" height="3" rx="0.6" {...g.red} /></Gloss>
}

/** Undo: an arrow turning back. */
export const UndoIcon = ({ size }: Sized) => {
  const g = useGloss('blue')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="M2.6 7.4 7.4 3v2.8h3.4c3.6 0 6.6 2.8 6.6 6.3s-2.8 5.4-5.6 5.6v-2.9c1.3-.2 2.6-1.1 2.6-2.7s-1.6-3.4-3.6-3.4H7.4v2.9z" {...g.blue} />
    </Gloss>
  )
}

/** Reverse: two arrows, opposite ways. */
export const ReverseIcon = ({ size }: Sized) => {
  const g = useGloss('teal', 'purple')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="M2 6.4 6 2.8v2.2h10v2.8H6V10z" {...g.teal} />
      <path d="M18 13.6 14 17.2V15H4v-2.8h10V10z" {...g.purple} />
    </Gloss>
  )
}

/** Clear: an eraser. */
export const EraserIcon = ({ size }: Sized) => {
  const g = useGloss('pink', 'white')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="M11.4 2.8 17.6 9 11 15.6 4.8 9.4z" {...g.pink} />
      <path d="M4.8 9.4 11 15.6l-1.6 1.6H6.4l-3.6-3.6a1.6 1.6 0 0 1 0-2.2z" {...g.white} />
      <path d="M10.4 17.2h7" stroke={tone('steel', 1)} strokeWidth="1.2" />
    </Gloss>
  )
}

/** Delete: a bin. */
export const BinIcon = ({ size }: Sized) => {
  const g = useGloss('steel', 'red')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="M5 6.4h10l-.9 10.2c-.1.8-.7 1.4-1.5 1.4H7.4c-.8 0-1.4-.6-1.5-1.4z" {...g.steel} />
      <rect x="3.4" y="4" width="13.2" height="2.6" rx="1" {...g.red} />
      <path d="M8 2.6h4v1.4H8z" {...g.red} />
    </Gloss>
  )
}

/** Rename: a text cursor in a field. */
export const RenameIcon = ({ size }: Sized) => {
  const g = useGloss('white', 'blue')
  return (
    <Gloss defs={g.defs} size={size}>
      <rect x="1.8" y="5.6" width="16.4" height="8.8" rx="1.8" {...g.white} />
      <path d="M5 12.2 6.8 7.8l1.8 4.4M5.6 10.8h2.4" stroke={tone('slate', 1)} strokeWidth="1.2" fill="none" />
      <rect x="12.6" y="3.4" width="1.8" height="13.2" rx="0.6" {...g.blue} />
    </Gloss>
  )
}

/** Brush (paint tiles). */
export const BrushIcon = ({ size }: Sized) => {
  const g = useGloss('wood', 'purple')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="M17.6 2.4c.5.5-5.8 7.8-6.8 8.8l-2-2c1-1 8.3-7.3 8.8-6.8z" {...g.wood} />
      <path d="M8.2 9.8 10.2 11.8c-.2 2.6-2.4 4.4-4.4 4.6-1.4.2-2.4.6-3.4 1.4.4-1.4.6-2.4.8-3.6.4-2.2 2.4-4.2 5-4.4z" {...g.purple} />
    </Gloss>
  )
}

/** Pick (eyedropper): a dropper taking a colour. */
export const PipetteIcon = ({ size }: Sized) => {
  const g = useGloss('sky', 'red')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="M11.2 6.2 13.8 8.8 6.4 16.2c-.6.6-1.6.9-2.4.6l-.6.6-.6-.6.6-.6c-.3-.8 0-1.8.6-2.4z" {...g.sky} />
      <path d="M12.2 3.4c1-1 2.6-1.4 3.8-.4s.8 2.8-.2 3.8l-1 1 .8.8-1.2 1.2-5.2-5.2L10.4 3.4l.8.8z" {...g.red} />
      <circle cx="3.2" cy="17.4" r="1.2" fill={tone('sky', 1)} />
    </Gloss>
  )
}

/** Rectangle (paint a box of tiles). */
export const RectIcon = ({ size }: Sized) => {
  const g = useGloss('sky')
  return (
    <Gloss defs={g.defs} size={size}>
      <rect x="3" y="4" width="14" height="12" rx="1" {...g.sky} strokeDasharray="2.2 1.6" strokeWidth={1.2} />
    </Gloss>
  )
}

/** A character's sheet. */
export const SheetIcon = ({ size }: Sized) => {
  const g = useGloss('paper', 'gold')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="M4 2.4h8.4L16 6v11.6H4z" {...g.paper} />
      <circle cx="8" cy="7.2" r="1.8" {...g.gold} />
      <path d="M6.4 11.4h7.2M6.4 14h5" stroke={tone('paper')} strokeWidth="1.1" />
    </Gloss>
  )
}

/** Focus your own view: a magnifier. */
export const FocusIcon = ({ size }: Sized) => {
  const g = useGloss('sky', 'wood')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="m12.4 12.4 5 5" stroke={tone('wood')} strokeWidth="3.4" />
      <path d="m12.4 12.4 5 5" stroke={g.wood.fill} strokeWidth="2" />
      <circle cx="8.4" cy="8.4" r="5.6" {...g.sky} strokeWidth={1.4} />
    </Gloss>
  )
}

/** Open a resource. */
export const OpenIcon = ({ size }: Sized) => {
  const g = useGloss('steel', 'blue')
  return (
    <Gloss defs={g.defs} size={size}>
      <rect x="2.4" y="4.6" width="13" height="13" rx="2" {...g.steel} />
      <path d="M10 2.4h7.6V10l-2.6-2.6-4.6 4.6-2.4-2.4 4.6-4.6z" {...g.blue} />
    </Gloss>
  )
}

/** Images: a picture in a frame. */
export const FrameIcon = ({ size }: Sized) => {
  const g = useGloss('wood', 'sky', 'green')
  return (
    <Gloss defs={g.defs} size={size}>
      <rect x="2" y="3" width="16" height="14" rx="1.6" {...g.wood} />
      <rect x="4.4" y="5.4" width="11.2" height="9.2" rx="0.6" {...g.sky} />
      <path d="M4.4 14.6 8.4 9.6l2.6 3 1.8-1.8 2.8 3.8z" {...g.green} strokeWidth={0.7} />
      <circle cx="13" cy="7.8" r="1.1" fill="#fff7c0" />
    </Gloss>
  )
}

/** Terrain: a brush over a world. */
export const WorldBrushIcon = ({ size }: Sized) => {
  const g = useGloss('blue', 'green', 'wood', 'red')
  return (
    <Gloss defs={g.defs} size={size}>
      <circle cx="8.6" cy="11" r="6.6" {...g.blue} />
      <path d="M4.2 8.4c1.4-.6 2.6.2 3.4 1.2.8 1 .2 2.4 1.2 3.2s2.4.4 2.8 1.8c-1 1.2-2.6 2-4.2 1.8-1.8-.6-3.6-2.6-3.2-4.4zM9.4 5.2c1 .2 2.4.8 2.6 2-.6.8-2 .8-2.6.2z" {...g.green} strokeWidth={0.7} />
      <path d="M18.2 1.6c.5.5-3.6 5.8-4.6 6.8l-1.6-1.6c1-1 5.7-5.7 6.2-5.2z" {...g.wood} />
      <path d="M12 6.8l1.6 1.6c-.2 1.6-1.6 2.6-3 2.6.4-1.6 0-2.4 1.4-4.2z" {...g.red} />
    </Gloss>
  )
}

/** Roads and rivers: a river winding past a road. */
export const WaysIcon = ({ size }: Sized) => {
  const g = useGloss('green', 'blue', 'paper')
  const river = 'M3 2.5c4 2 6 3.6 3.6 6.4S5 14 10 17.5'
  const road = 'M17 2.5c-2.6 2.4-5 4.6-3.2 7.6s1.6 5 .2 7.4'
  return (
    <Gloss defs={g.defs} size={size}>
      <rect x="1.6" y="1.6" width="16.8" height="16.8" rx="3" {...g.green} />
      <path d={river} fill="none" stroke={tone('blue')} strokeWidth="3.4" />
      <path d={river} fill="none" stroke={g.blue.fill} strokeWidth="2.2" />
      <path d={road} fill="none" stroke={tone('paper')} strokeWidth="3" />
      <path d={road} fill="none" stroke={g.paper.fill} strokeWidth="1.8" />
    </Gloss>
  )
}

/** Landmarks: a castle. */
/** Scenery (plan 48): a pine before a snowy peak. */
export const SceneryIcon = ({ size }: Sized) => {
  const g = useGloss('steel', 'white', 'green')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="M6 17.6 12.2 3.4l6.4 14.2z" {...g.steel} />
      <path d="M12.2 3.4 14.6 8.8l-1.6-.8-1.2 1.4-1.2-1.2-1.4.8z" {...g.white} strokeWidth={0.6} />
      <path d="M5.4 2.8 9.6 10H8l2.6 4.4H8.4L10.8 18H0l2.4-3.6H.2L2.8 10H1.2z" {...g.green} />
    </Gloss>
  )
}

/** Features (plan 48): a windmill. */
export const FeatureIcon = ({ size }: Sized) => {
  const g = useGloss('paper', 'red', 'wood')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="M7.4 18.4 8.6 8.6h2.8l1.2 9.8z" {...g.paper} />
      <path d="M8.2 9 10 5.6 11.8 9z" {...g.red} />
      <path d="M10 7.4 3.2 2.2M10 7.4l6.8-5.2M10 7.4 3.6 13.2M10 7.4l6.4 5.8" stroke={tone('wood', 2)} strokeWidth={2} strokeLinecap="round" fill="none" />
      <circle cx="10" cy="7.4" r="1.2" {...g.wood} />
    </Gloss>
  )
}

export const CastleIcon = ({ size }: Sized) => {
  const g = useGloss('steel', 'blue', 'red')
  return (
    <Gloss defs={g.defs} size={size}>
      <path d="M2.4 18V9.4h2.2V7.6h1.6v1.8h1.6V7.6h1.6v1.8H11V7.6h1.6v1.8h1.6V7.6h1.6v1.8h2.2V18z" {...g.steel} />
      <path d="M8 18v-3.6a2 2 0 0 1 4 0V18z" fill={tone('dark', 2)} />
      <path d="M3.4 7.6 5.4 3l2 4.6zM12.6 7.6 14.6 3l2 4.6z" {...g.blue} />
      <path d="M5.4 3V1.2l2.2.8-2.2.8" {...g.red} strokeWidth={0.6} />
    </Gloss>
  )
}
