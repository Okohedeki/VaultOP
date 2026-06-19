// Single source of UI state: assets + jobs, kept live by main-process push events
// and refreshed once on mount. Every consumer reads from here.

import { useCallback, useEffect, useState } from 'react'
import type { Asset, Aspect, Job, Variant } from '@shared/domain'
import { bridgeReady, getBridge } from '../lib/bridge'

export type LoadState = 'loading' | 'ready' | 'error'

export interface VaultState {
  loadState: LoadState
  error: string | null
  assets: Asset[]
  jobs: Job[]
  variants: Variant[]
  addFiles: (paths: string[]) => Promise<void>
  pickAndAdd: () => Promise<void>
  makeTeaser: (assetId: string) => Promise<void>
  makeFanout: (assetId: string) => Promise<void>
  makeCompilation: (segmentIds: string[], aspect: Aspect) => Promise<void>
  makePromos: (cutVariantId: string, platforms: string[]) => Promise<void>
  exportVariant: (variantId: string) => Promise<string | null>
  exportWatermarked: (variantId: string, fanLabel: string) => Promise<string | null>
}

export function useVault(): VaultState {
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [assets, setAssets] = useState<Asset[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [variants, setVariants] = useState<Variant[]>([])

  const refresh = useCallback(async () => {
    const b = getBridge()
    const [a, j, v] = await Promise.all([
      b.invoke('assets:list', {}),
      b.invoke('jobs:list', {}),
      b.invoke('variants:list', {}),
    ])
    setAssets(a.assets)
    setJobs(j.jobs)
    setVariants(v.variants)
  }, [])

  useEffect(() => {
    if (!bridgeReady()) {
      setLoadState('error')
      setError('The app bridge failed to initialize. Try restarting VaultOP.')
      return
    }
    const b = getBridge()
    const offAssets = b.on('assets:changed', (p) => setAssets(p.assets))
    const offJobs = b.on('jobs:changed', (p) => setJobs(p.jobs))
    const offVariants = b.on('variants:changed', (p) => setVariants(p.variants))

    refresh()
      .then(() => setLoadState('ready'))
      .catch((e: unknown) => {
        setLoadState('error')
        setError(e instanceof Error ? e.message : String(e))
      })

    return () => {
      offAssets()
      offJobs()
      offVariants()
    }
  }, [refresh])

  const addFiles = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return
    await getBridge().invoke('ingest:addFiles', { paths })
  }, [])

  const pickAndAdd = useCallback(async () => {
    const paths = await getBridge().pickFiles()
    if (paths.length) await getBridge().invoke('ingest:addFiles', { paths })
  }, [])

  const makeTeaser = useCallback(async (assetId: string) => {
    await getBridge().invoke('assembly:teaser', { assetId })
  }, [])

  const makeFanout = useCallback(async (assetId: string) => {
    await getBridge().invoke('assembly:fanout', { assetId })
  }, [])

  const exportWatermarked = useCallback(async (variantId: string, fanLabel: string) => {
    const res = await getBridge().invoke('variant:exportWatermarked', { variantId, fanLabel })
    return res.path
  }, [])

  const makeCompilation = useCallback(async (segmentIds: string[], aspect: Aspect) => {
    await getBridge().invoke('assembly:compilation', { segmentIds, aspect })
  }, [])

  const makePromos = useCallback(async (cutVariantId: string, platforms: string[]) => {
    await getBridge().invoke('promos:create', { cutVariantId, platforms })
  }, [])

  const exportVariant = useCallback(async (variantId: string) => {
    const res = await getBridge().invoke('variant:export', { variantId })
    return res.path
  }, [])

  return {
    loadState,
    error,
    assets,
    jobs,
    variants,
    addFiles,
    pickAndAdd,
    makeTeaser,
    makeFanout,
    makeCompilation,
    makePromos,
    exportVariant,
    exportWatermarked,
  }
}
