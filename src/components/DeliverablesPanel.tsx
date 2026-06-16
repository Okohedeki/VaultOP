import { useState } from 'react'
import type { Variant } from '@shared/domain'
import { Badge, Button, Card, EmptyState, ProgressBar, Spinner } from '../design/primitives'
import { formatDuration } from '../lib/format'

const STATE_TONE = {
  queued: 'default',
  rendering: 'accent',
  ready: 'ok',
  failed: 'danger',
} as const

interface Props {
  variants: Variant[]
  jobProgressFor: (variantId: string) => number | undefined
  onExport: (variantId: string) => Promise<string | null>
  onReview: (variantId: string) => void
}

export function DeliverablesPanel({ variants, jobProgressFor, onExport, onReview }: Props) {
  const [exporting, setExporting] = useState<string | null>(null)

  if (variants.length === 0) {
    return <EmptyState title="No deliverables yet" hint="Make a teaser or compilation." />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', overflow: 'auto' }}>
      {variants.map((v) => (
        <Card key={v.id} className="job">
          <div className="job__row">
            <span className="job__type">
              {v.renderState === 'rendering' && <Spinner />} {v.type} · {v.aspect}
            </span>
            <Badge tone={STATE_TONE[v.renderState]}>{v.renderState}</Badge>
          </div>
          {v.renderState === 'rendering' && <ProgressBar value={jobProgressFor(v.id) ?? 0} />}
          {v.renderState === 'ready' && (
            <div className="job__row">
              <span className="seg__time">{v.durationMs ? formatDuration(v.durationMs) : ''}</span>
              {v.requiresReview && v.reviewState === 'pending' ? (
                <Button variant="primary" onClick={() => onReview(v.id)}>
                  ⚠ Review to unlock
                </Button>
              ) : v.requiresReview && v.reviewState === 'rejected' ? (
                <Button onClick={() => onReview(v.id)}>Re-review</Button>
              ) : (
                <Button
                  disabled={exporting === v.id}
                  onClick={async () => {
                    setExporting(v.id)
                    try {
                      await onExport(v.id)
                    } finally {
                      setExporting(null)
                    }
                  }}
                >
                  {exporting === v.id ? 'Exporting…' : 'Export…'}
                </Button>
              )}
            </div>
          )}
          {v.requiresReview && v.reviewState === 'approved' && (
            <Badge tone="ok">verified · safe to post</Badge>
          )}
          {v.renderState === 'failed' && v.renderError && (
            <div className="asset__error">⚠ {v.renderError}</div>
          )}
        </Card>
      ))}
    </div>
  )
}
