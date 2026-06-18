import type { Asset } from '@shared/domain'
import { Badge, Button, EmptyState, Skeleton } from '../design/primitives'
import { useSegments } from '../state/useSegments'
import { formatDuration } from '../lib/format'
import { Thumb } from './Thumb'

interface Props {
  asset: Asset
  revision: number
  onBack: () => void
  onFindSimilar: (segmentId: string) => void
  onMakeTeaser: (assetId: string) => void
}

export function SegmentGrid({ asset, revision, onBack, onFindSimilar, onMakeTeaser }: Props) {
  const { loadState, error, segments } = useSegments(asset.id, revision)
  const analyzing = asset.status === 'analyzing' || asset.status === 'transcoding'

  return (
    <div className="seg">
      <div className="seg__head">
        <Button onClick={onBack} aria-label="Back to vault">
          ← Vault
        </Button>
        <div className="seg__title">
          <span className="seg__name">{asset.originalFilename}</span>
          {analyzing ? (
            <Badge tone="accent">finding scenes…</Badge>
          ) : (
            <Badge tone="ok">
              {segments.length} scene{segments.length === 1 ? '' : 's'}
            </Badge>
          )}
        </div>
        {segments.length > 0 && (
          <Button variant="primary" onClick={() => onMakeTeaser(asset.id)}>
            ✦ Make 30s teaser
          </Button>
        )}
      </div>

      {loadState === 'loading' && (
        <div className="seg__grid">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} height={120} />
          ))}
        </div>
      )}

      {loadState === 'error' && <EmptyState title="Couldn’t load scenes" hint={error ?? ''} />}

      {loadState === 'ready' && segments.length === 0 && (
        <EmptyState
          title={analyzing ? 'Splitting into scenes…' : 'No segments yet'}
          hint={analyzing ? 'Thumbnails appear as scenes are detected.' : undefined}
        />
      )}

      {loadState === 'ready' && segments.length > 0 && (
        <div className="seg__grid">
          {segments.map((s, i) => (
            <figure className="seg__tile" key={s.id}>
              <Thumb segmentId={s.id} alt={`Scene ${i + 1}`} />
              <figcaption className="seg__cap">
                <span className="seg__time">
                  {formatDuration(s.startMs)}–{formatDuration(s.endMs)}
                </span>
                <button className="seg__sim" onClick={() => onFindSimilar(s.id)}>
                  ⌕ similar
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}
