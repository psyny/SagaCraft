import type { ImageValue, Resource } from '../api/types'
import { useOptionalSaga } from '../saga/SagaContext'
import Picture from './Picture'

/**
 * A resource's icon, round: its icon picture, else its main picture's face crop, else its initial. Which
 * attributes those are comes from the ruleset (an image of category "icon", the first other image).
 */
export function iconOf(resource: Resource, attributes?: { key: string; type: string; many: boolean; category?: string | null }[]):
  { url?: string; face?: ImageValue['face'] | null } | null {
  const attrs = attributes || []
  const icon = attrs.find((a) => a.type === 'image' && !a.many && a.category === 'icon')
  const picture = attrs.find((a) => a.type === 'image' && !a.many && a.category !== 'icon')
  const value = (key?: string) => (key ? (resource.attributes[key] as ImageValue | undefined) : undefined)
  const own = value(icon?.key)
  if (own?.url) return { url: own.url, face: null }
  const pic = value(picture?.key)
  if (pic?.url) return { url: pic.url, face: pic.face }
  return null
}

export default function ResourceIcon({ resource, className = 'mini-pic round' }: { resource: Resource; className?: string }) {
  const saga = useOptionalSaga()
  const attributes = saga?.ruleset.kinds[resource.kind]?.types[resource.type]?.attributes
  const icon = iconOf(resource, attributes)
  if (!icon?.url) return <div className={`${className} picture picture-empty`}>{(resource.name || '?').slice(0, 1)}</div>
  return <Picture url={icon.url} mode={icon.face ? 'face' : 'full'} face={icon.face} className={className} />
}
