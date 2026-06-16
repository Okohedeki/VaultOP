import { memo } from 'react'
import type { Asset, Job } from '@shared/domain'
import { Badge, Card, EmptyState, ProgressBar, Skeleton } from '../design/primitives'
import { formatBytes, statusTone } from '../lib/format'

interface Props {
  loadState: 'loading' | 'ready' | 'error'
  error: string | null
  assets: Asset[]
  jobs: Job[]
  onSelect: (asset: Asset) => void
}

export function AssetList({ loadState, error, assets, jobs, onSelect }: Props) {
  if (loadState === 'loading') {
    return (
      <div className="asset-list" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="asset">
            <Skeleton width="60%" />
            <Skeleton width={70} />
            <div className="asset__progress">
              <Skeleton height={6} />
            </div>
          </Card>
        ))}
      </div>
    )
  }

  if (loadState === 'error') {
    return <EmptyState title="Couldn’t load the vault" hint={error ?? 'Unknown error'} />
  }

  if (assets.length === 0) {
    return (
      <EmptyState
        title="The vault is empty"
        hint="Drop a file above to ingest your first asset."
      />
    )
  }

  return (
    <div className="asset-list">
      {assets.map((a) => (
        <AssetRow
          key={a.id}
          asset={a}
          job={jobs.find((j) => j.targetId === a.id)}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

const AssetRow = memo(function AssetRow({
  asset,
  job,
  onSelect,
}: {
  asset: Asset
  job?: Job
  onSelect: (a: Asset) => void
}) {
  const inFlight = asset.status === 'transcoding' || asset.status === 'analyzing'
  const progress = job?.state === 'running' || job?.state === 'queued' ? job.progress : undefined
  const openable = asset.status === 'ready' || asset.status === 'analyzing'
  return (
    <Card
      className={`asset ${openable ? 'asset--clickable' : ''}`}
      role={openable ? 'button' : undefined}
      tabIndex={openable ? 0 : undefined}
      onClick={() => openable && onSelect(asset)}
      onKeyDown={(e) => {
        if (openable && (e.key === 'Enter' || e.key === ' ')) onSelect(asset)
      }}
    >
      <div>
        <div className="asset__name">{asset.originalFilename}</div>
        <div className="asset__meta">
          {formatBytes(asset.bytes)} · {asset.contentHash.slice(0, 12)}
        </div>
      </div>
      <Badge tone={statusTone(asset.status)}>{asset.status}</Badge>
      {inFlight && (
        <div className="asset__progress">
          <ProgressBar value={progress ?? 0} />
        </div>
      )}
      {asset.status === 'failed' && asset.error && (
        <div className="asset__error">⚠ {asset.error}</div>
      )}
    </Card>
  )
})
