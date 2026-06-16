import { useCallback, useEffect, useState } from 'react'
import type { MaskRegion, ReviewInfo } from '@shared/domain'
import { getBridge } from '../lib/bridge'

interface ReviewState {
  loading: boolean
  error: string | null
  info: ReviewInfo | null
  frameDataUrl: string | null
}

export function useReview(variantId: string | null) {
  const [state, setState] = useState<ReviewState>({
    loading: true,
    error: null,
    info: null,
    frameDataUrl: null,
  })

  useEffect(() => {
    if (!variantId) return
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    getBridge()
      .invoke('review:get', { variantId })
      .then((r) => {
        if (!cancelled) {
          setState({ loading: false, error: null, info: r.info, frameDataUrl: r.frameDataUrl })
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) }))
        }
      })
    return () => {
      cancelled = true
    }
  }, [variantId])

  const saveMasks = useCallback(
    async (masks: MaskRegion[]) => {
      if (!variantId) return
      await getBridge().invoke('review:setMasks', { variantId, masks })
    },
    [variantId],
  )

  const approve = useCallback(
    async (masks: MaskRegion[]) => {
      if (!variantId) return
      await getBridge().invoke('review:setMasks', { variantId, masks })
      await getBridge().invoke('review:approve', { variantId })
    },
    [variantId],
  )

  const reject = useCallback(async () => {
    if (!variantId) return
    await getBridge().invoke('review:reject', { variantId })
  }, [variantId])

  return { ...state, saveMasks, approve, reject }
}
