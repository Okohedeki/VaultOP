import { useEffect, useState } from 'react'
import type { SearchHit } from '@shared/domain'
import { getBridge } from '../lib/bridge'

export type SearchMode = { kind: 'text'; query: string } | { kind: 'similar'; segmentId: string }

interface SearchState {
  loading: boolean
  error: string | null
  hits: SearchHit[]
}

/** Runs text or visual-similarity search, debounced for text. */
export function useSearch(mode: SearchMode | null): SearchState {
  const [state, setState] = useState<SearchState>({ loading: false, error: null, hits: [] })

  useEffect(() => {
    if (!mode) {
      setState({ loading: false, error: null, hits: [] })
      return
    }
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))

    const run = async (): Promise<void> => {
      const b = getBridge()
      const res =
        mode.kind === 'text'
          ? await b.invoke('search:query', { query: mode.query })
          : await b.invoke('segments:similar', { segmentId: mode.segmentId })
      if (!cancelled) setState({ loading: false, error: null, hits: res.hits })
    }

    // Debounce text queries; run similarity immediately.
    const delay = mode.kind === 'text' ? 180 : 0
    const t = setTimeout(() => {
      run().catch((e: unknown) => {
        if (!cancelled) {
          setState({ loading: false, error: e instanceof Error ? e.message : String(e), hits: [] })
        }
      })
    }, delay)

    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [mode?.kind, mode?.kind === 'text' ? mode.query : mode?.segmentId])

  return state
}
