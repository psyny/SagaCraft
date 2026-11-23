export type RollRead = 'sum' | 'highest' | 'lowest' | 'sum_above' | 'sum_below'
export const DIE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const

/** A roll type: some dice and how they're read (backend domain/dice.py). */
export interface RollType {
  id: string
  name: string
  dice: { count: number; sides: number }[]
  read: RollRead
  x: number
  modifier: number
  /** "2d20 (highest)", from the server. */
  label?: string
}

export interface TrayDie {
  id: number
  group: number
  type_id: string
  sides: number
  member_id: number
  member: string
  color: string
  style: string
  /** The DM's pick (the DM only). */
  forced?: number | null
}

export interface RolledGroup {
  group: number
  type_id: string
  name: string
  label: string
  member: string
  color: string
  style: string
  dice: { id: number; sides: number; value: number; counted: boolean }[]
  result: number
}

/** A roll on the Set: one member's (a row of results); it stays until they (or the DM) clear it. */
export interface Roll {
  id: number
  seed: number
  /** Whose (null: from before rolls were rows). */
  member_id: number | null
  by: string
  color?: string
  groups: RolledGroup[]
  at: number
}

/** What the server renders for a Dice roller Set (backend set_types/dice.py). */
export interface DiceContent {
  roll_types: RollType[]
  /** The dice waiting: your own (the DM: everyone's). */
  tray: TrayDie[]
  /** The rolls on the Set, oldest first. */
  rolls: Roll[]
  /** May this viewer roll here? */
  can_roll?: boolean
  /** The DM: who may roll (null: everyone who sees it). */
  rollers?: { groups: number[]; members: number[] } | null
  /** Where the tray sits (the dice are thrown from it). */
  tray_edge?: 'bottom' | 'top' | 'left' | 'right'
  /** The throw's speed (0.5 to 5; above 5: instant) and the dice's size (0.6 to 1.8). */
  speed?: number
  dice_size?: number
}
