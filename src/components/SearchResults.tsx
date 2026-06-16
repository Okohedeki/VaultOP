import type { SearchHit } from '@shared/domain'
import { Badge, Button, EmptyState, Skeleton } from '../design/primitives'
import { useSearch, type SearchMode } from '../state/useSearch'
import { formatDuration } from '../lib/format'
import { Thumb } from './Thumb'

interface Props {
  mode: SearchMode
  onFindSimilar: (segmentId: string) => void
  onCompile: (segmentIds: string[]) => void
}

export function SearchResults({ mode, onFindSimilar, onCompile }: Props) {
  const { loading, error, hits } = useSearch(mode)

  if (loading) {
    return (
      <div className="seg__grid">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={150} />
        ))}
      </div>
    )
  }
  if (error) return <EmptyState title="Search failed" hint={error} />
  if (hits.length === 0) {
    return (
      <EmptyState
        title="No matches"
        hint={mode.kind === 'text' ? 'Try a tag like “bright”, “warm”, “short”.' : 'No similar scenes.'}
      />
    )
  }

  return (
    <>
      <div className="seg__toolbar">
        <span className="seg__count">{hits.length} scenes</span>
        <Button variant="primary" onClick={() => onCompile(hits.map((h) => h.segment.id))}>
          ✦ Compile these into one cut
        </Button>
      </div>
      <div className="seg__grid">
        {hits.map((h, i) => (
        <figure className="seg__tile" key={h.segment.id}>
          <Thumb segmentId={h.segment.id} alt={`Result ${i + 1}`} />
          <figcaption className="seg__cap seg__cap--col">
            <div className="seg__taglist">
              {h.tags.slice(0, 3).map((t) => (
                <span className="seg__tag" key={t.key + t.value}>
                  {t.value}
                </span>
              ))}
            </div>
            <div className="seg__caprow">
              <span className="seg__time">
                {formatDuration(h.segment.startMs)}–{formatDuration(h.segment.endMs)}
              </span>
              <button className="seg__sim" onClick={() => onFindSimilar(h.segment.id)}>
                ⌕ similar
              </button>
            </div>
            {h.score != null && mode.kind === 'similar' && (
              <Badge tone="accent">{Math.round(h.score * 100)}% match</Badge>
            )}
          </figcaption>
        </figure>
        ))}
      </div>
    </>
  )
}
