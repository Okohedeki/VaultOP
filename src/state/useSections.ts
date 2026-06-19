import { useCallback, useEffect, useState } from 'react'
import type { Master, Section } from '@shared/domain'
import { getBridge } from '../lib/bridge'

export interface SectionsState {
  loadState: 'loading' | 'ready' | 'error'
  error: string | null
  master: Master | null
  /** vaultmedia:// URL for the decrypted Master, or null while resolving. */
  mediaUrl: string | null
  sections: Section[]
  reload: () => Promise<void>
  create: (input: { startMs: number; endMs: number; label?: string | null }) => Promise<void>
  update: (
    id: string,
    patch: { startMs?: number; endMs?: number; label?: string | null; favorite?: boolean },
  ) => Promise<void>
  remove: (id: string) => Promise<void>
  addTag: (sectionId: string, value: string) => Promise<void>
  removeTag: (sectionId: string, value: string) => Promise<void>
}

/** Editor data for one Master: resolve the Master + playable URL, list its Sections
 *  (seeded from Scenes on first open), and expose Section/Tag mutations that reload. */
export function useSections(assetId: string | null): SectionsState {
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [master, setMaster] = useState<Master | null>(null)
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [sections, setSections] = useState<Section[]>([])

  const loadSections = useCallback(async (masterId: string) => {
    const res = await getBridge().invoke('sections:listByMaster', { masterId })
    setSections(res.sections)
  }, [])

  const reload = useCallback(async () => {
    if (!master) return
    await loadSections(master.id)
  }, [master, loadSections])

  useEffect(() => {
    if (!assetId) return
    let cancelled = false
    setLoadState('loading')
    setError(null)
    ;(async () => {
      const b = getBridge()
      const { master: m } = await b.invoke('master:getByAsset', { assetId })
      if (cancelled) return
      setMaster(m)
      if (!m) {
        setLoadState('error')
        setError('This clip is still processing — no master yet.')
        return
      }
      await loadSections(m.id)
      const { url } = await b.invoke('media:masterUrl', { masterId: m.id })
      if (cancelled) return
      setMediaUrl(url)
      setLoadState('ready')
    })().catch((e: unknown) => {
      if (cancelled) return
      setLoadState('error')
      setError(e instanceof Error ? e.message : String(e))
    })
    return () => {
      cancelled = true
    }
  }, [assetId, loadSections])

  const create: SectionsState['create'] = useCallback(
    async (input) => {
      if (!master) return
      await getBridge().invoke('sections:create', { masterId: master.id, ...input })
      await loadSections(master.id)
    },
    [master, loadSections],
  )

  const update: SectionsState['update'] = useCallback(
    async (id, patch) => {
      await getBridge().invoke('sections:update', { id, ...patch })
      if (master) await loadSections(master.id)
    },
    [master, loadSections],
  )

  const remove: SectionsState['remove'] = useCallback(
    async (id) => {
      await getBridge().invoke('sections:delete', { id })
      if (master) await loadSections(master.id)
    },
    [master, loadSections],
  )

  const addTag: SectionsState['addTag'] = useCallback(
    async (sectionId, value) => {
      await getBridge().invoke('sections:tag', { sectionId, value })
      if (master) await loadSections(master.id)
    },
    [master, loadSections],
  )

  const removeTag: SectionsState['removeTag'] = useCallback(
    async (sectionId, value) => {
      await getBridge().invoke('sections:untag', { sectionId, value })
      if (master) await loadSections(master.id)
    },
    [master, loadSections],
  )

  return {
    loadState,
    error,
    master,
    mediaUrl,
    sections,
    reload,
    create,
    update,
    remove,
    addTag,
    removeTag,
  }
}
