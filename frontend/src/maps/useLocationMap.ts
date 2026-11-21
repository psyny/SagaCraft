/** A location's map, kept up to date (other DMs' and Stages' edits arrive live), and its map commands. */
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import type { LocationMap } from '../api/types'
import { useOptionalSaga } from '../saga/SagaContext'

export type MapCommand = (name: string, args?: Record<string, unknown>) => Promise<LocationMap | null>

export function useLocationMap(sagaId: number, locationId: number | null) {
  const saga = useOptionalSaga()
  const [map, setMap] = useState<LocationMap | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    if (locationId === null) return setMap(null)
    api.locationMap(sagaId, locationId).then(setMap).catch((e: Error) => setError(e.message))
  }, [sagaId, locationId])
  useEffect(load, [load])
  useEffect(() => saga?.onLocationUpdated((id) => { if (id === locationId) load() }), [saga, locationId, load])

  const run: MapCommand = useCallback(async (name, args = {}) => {
    if (locationId === null) return null
    setError('')
    try {
      const next = await api.mapCommand(sagaId, locationId, name, args)
      setMap(next)
      return next
    } catch (e) {
      setError((e as Error).message)
      return null
    }
  }, [sagaId, locationId])

  return { map, setMap, run, error, setError, reload: load }
}
