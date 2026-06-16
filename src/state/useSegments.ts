import { useCallback, useEffect, useState } from 'react'
import type { Segment } from '@shared/domain'
import { getBridge } from '../lib/bridge'

export interface SegmentsState {
  loadState: 'loading' | 'ready' | 'error'
  error: string | null
  segments: Segment[]
  reload: () => Promise<void>
}

/** Load a selected asset's segments; `revision` bumps trigger a reload (e.g. when
 *  the asset finishes analyzing and segments appear). */
export function useSegments(assetId: string | null, revision: number): SegmentsState {
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [segments, setSegments] = useState<Segment[]>([])

  const reload = useCallback(async () => {
    if (!assetId) return
    const res = await getBridge().invoke('segments:listByAsset', { assetId })
    setSegments(res.segments)
  }, [assetId])

  useEffect(() => {
    if (!assetId) return
    setLoadState('loading')
    reload()
      .then(() => setLoadState('ready'))
      .catch((e: unknown) => {
        setLoadState('error')
        setError(e instanceof Error ? e.message : String(e))
      })
  }, [assetId, revision, reload])

  return { loadState, error, segments, reload }
}
