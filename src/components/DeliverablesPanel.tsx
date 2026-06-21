import { useState } from 'react'
import type { Variant } from '@shared/domain'
import { PLATFORMS } from '@shared/platforms'
import { Badge, Button, Card, EmptyState, ProgressBar, Spinner } from '../design/primitives'
import { formatDuration } from '../lib/format'

const STATE_TONE = {
  queued: 'default',
  rendering: 'accent',
  ready: 'ok',
  failed: 'danger',
} as const

const TYPE_LABEL: Record<string, string> = {
  cut: 'Cut',
  promo: 'Promo',
  teaser: 'Teaser',
  compilation: 'Compilation',
  paid: 'Paid cut',
  gif: 'GIF',
  vertical: 'Vertical',
}

interface Props {
  variants: Variant[]
  jobProgressFor: (variantId: string) => number | undefined
  onExport: (variantId: string) => Promise<string | null>
  onReview: (variantId: string) => void
  onMakePromos: (cutVariantId: string, platforms: string[]) => Promise<void>
}

export function DeliverablesPanel({
  variants,
  jobProgressFor,
  onExport,
  onReview,
  onMakePromos,
}: Props) {
  const [exporting, setExporting] = useState<string | null>(null)
  const [promoFor, setPromoFor] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set(['tiktok']))
  const [making, setMaking] = useState(false)

  if (variants.length === 0) {
    return <EmptyState title="No deliverables yet" hint="Edit a clip and render a Cut." />
  }

  const togglePick = (key: string): void =>
    setPicked((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div className="panel-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', overflow: 'auto' }}>
      {variants.map((v) => (
        <Card key={v.id} className="job">
          <div className="job__row">
            <span className="job__type">
              {v.renderState === 'rendering' && <Spinner />} {TYPE_LABEL[v.type] ?? v.type} · {v.aspect}
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
                <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                  {v.type === 'cut' && (
                    <Button
                      variant="primary"
                      onClick={() => setPromoFor(promoFor === v.id ? null : v.id)}
                    >
                      ✨ Make Promos
                    </Button>
                  )}
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
                </div>
              )}
            </div>
          )}

          {/* Cut → Promo platform picker */}
          {v.type === 'cut' && v.renderState === 'ready' && promoFor === v.id && (
            <div className="promo-pick">
              <div className="promo-pick__grid">
                {PLATFORMS.map((p) => (
                  <label key={p.key} className={`promo-pick__opt ${picked.has(p.key) ? 'is-on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={picked.has(p.key)}
                      onChange={() => togglePick(p.key)}
                    />
                    <span className="promo-pick__label">{p.label}</span>
                    <span className="promo-pick__hint">{p.hint}</span>
                  </label>
                ))}
              </div>
              <Button
                variant="primary"
                disabled={picked.size === 0 || making}
                onClick={async () => {
                  setMaking(true)
                  try {
                    await onMakePromos(v.id, [...picked])
                    setPromoFor(null)
                  } finally {
                    setMaking(false)
                  }
                }}
              >
                {making ? 'Creating…' : `Create ${picked.size} promo${picked.size === 1 ? '' : 's'} → gate`}
              </Button>
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
