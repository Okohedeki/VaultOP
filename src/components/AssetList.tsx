import { memo } from 'react'
import type { Asset, AssetStatus, Job } from '@shared/domain'
import { Card, EmptyState, ProgressBar } from '../design/primitives'
import { formatBytes } from '../lib/format'
import { Thumb } from './Thumb'

interface Props {
  loadState: 'loading' | 'ready' | 'error'
  error: string | null
  assets: Asset[]
  jobs: Job[]
  onSelect: (asset: Asset) => void
}

const PROCESSING: Partial<Record<AssetStatus, string>> = {
  uploaded: 'Queued',
  transcoding: 'Preparing…',
  analyzing: 'Finding scenes…',
}

export function AssetList({ loadState, error, assets, jobs, onSelect }: Props) {
  if (loadState === 'loading') {
    return (
      <div className="clip-grid" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="clip">
            <div className="clip__cover vop-skeleton" />
          </div>
        ))}
      </div>
    )
  }

  if (loadState === 'error') {
    return <EmptyState title="Couldn’t load your vault" hint={error ?? 'Unknown error'} />
  }

  if (assets.length === 0) {
    return (
      <EmptyState
        title="Your vault is empty"
        hint="Drop a shoot above — it’s encrypted, split into scenes, and tagged automatically."
        icon={<div className="empty-orb" aria-hidden />}
      />
    )
  }

  return (
    <div className="clip-grid">
      {assets.map((a, i) => (
        <ClipCard
          key={a.id}
          asset={a}
          index={i}
          job={jobs.find((j) => j.targetId === a.id)}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

const ClipCard = memo(function ClipCard({
  asset,
  index,
  job,
  onSelect,
}: {
  asset: Asset
  index: number
  job?: Job
  onSelect: (a: Asset) => void
}) {
  const processing = PROCESSING[asset.status]
  const failed = asset.status === 'failed'
  const openable = asset.status === 'ready' || asset.status === 'analyzing'
  const progress = job?.state === 'running' || job?.state === 'queued' ? job.progress : undefined
  const title = asset.originalFilename.replace(/\.[^.]+$/, '')

  return (
    <figure
      className={`clip rise ${openable ? 'clip--open' : ''} ${failed ? 'clip--failed' : ''}`}
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
      role={openable ? 'button' : undefined}
      tabIndex={openable ? 0 : undefined}
      onClick={() => openable && onSelect(asset)}
      onKeyDown={(e) => {
        if (openable && (e.key === 'Enter' || e.key === ' ')) onSelect(asset)
      }}
    >
      <div className="clip__cover">
        {asset.coverSegmentId ? (
          <Thumb segmentId={asset.coverSegmentId} alt={title} />
        ) : (
          <div className="clip__cover-ph">
            {failed ? '⚠' : <span className="clip__spark" aria-hidden />}
          </div>
        )}
        {processing && (
          <div className="clip__processing">
            <span>{processing}</span>
            <ProgressBar value={progress ?? 0} />
          </div>
        )}
        {asset.status === 'ready' && asset.segmentCount > 0 && (
          <span className="clip__count">
            {asset.segmentCount} scene{asset.segmentCount === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <figcaption className="clip__cap">
        <span className="clip__name" title={asset.originalFilename}>
          {title}
        </span>
        <span className="clip__meta">
          {failed ? (asset.error ?? 'Couldn’t process') : `${formatBytes(asset.bytes)}`}
        </span>
      </figcaption>
    </figure>
  )
})
