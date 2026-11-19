import { useEffect, useState } from 'react'
import { api } from '../../api'
import type { UploadLimits } from '../../api/types'

let cache: UploadLimits | null = null

/** Upload limits per category (system settings). Cached for the session; call refreshUploadLimits after changes. */
export function useUploadLimits(): UploadLimits | null {
  const [limits, setLimits] = useState<UploadLimits | null>(cache)
  useEffect(() => {
    if (cache) return
    api.uploadLimits().then((value) => {
      cache = value
      setLimits(value)
    }).catch(() => undefined)
  }, [])
  return limits
}

export function refreshUploadLimits(value: UploadLimits): void {
  cache = value
}
