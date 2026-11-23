/** A location's map as one of its layers shows it (`layer`; the first until one is picked), kept up to date (other DMs'
 * and Stages' edits arrive live), and its map commands (sent for that layer). */
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import type { LocationMap } from '../api/types'
import { useOptionalSaga } from '../saga/SagaContext'

export type MapCommand = (name: string, args?: Record<string, unknown>) => Promise<LocationMap | null>

export function useLocationMap(sagaId: number, locationId: number | null, initialLayer: string | null = null) {
  const saga = useOptionalSaga()
  const [map, setMap] = useState<LocationMap | null>(null)
  const [error, setError] = useState('')
  const [layer, setLayer] = useState<string | null>(initialLayer)

  const load = useCallback(() => {
    if (locationId === null) return setMap(null)
    api.locationMap(sagaId, locationId, layer).then(setMap).catch((e: Error) => setError(e.message))
  }, [sagaId, locationId, layer])
  useEffect(load, [load])
  useEffect(() => saga?.onLocationUpdated((id) => { if (id === locationId) load() }), [saga, locationId, load])

  const run: MapCommand = useCallback(async (name, args = {}) => {
    if (locationId === null) return null
    setError('')
    try {
      const next = await api.mapCommand(sagaId, locationId, name, { layer: layer ?? map?.layer, ...args })
      setMap(next)
      return next
    } catch (e) {
      setError((e as Error).message)
      return null
    }
  }, [sagaId, locationId, layer, map?.layer])

  return { map, setMap, run, error, setError, reload: load, layer: map?.layer ?? layer, setLayer }
}
