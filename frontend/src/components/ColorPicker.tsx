import { PALETTE } from '../saga/templates/modes'

/** A color: the palette in one click, or any color (groups, templates). */
export default function ColorPicker({ value, onChange, label }: { value: string; onChange: (color: string) => void; label: string }) {
  return (
    <div className="color-picker" role="group" aria-label={label}>
      {PALETTE.map((c) => (
        <button key={c} type="button" className={`swatch ${c === value.toLowerCase() ? 'on' : ''}`} style={{ background: c }}
          aria-label={`${label} ${c}`} onClick={() => onChange(c)} />
      ))}
      <input type="color" value={value} aria-label={`${label}: any color`} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
