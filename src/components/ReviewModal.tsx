import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { MaskRegion } from '@shared/domain'
import { Badge, Button, Spinner } from '../design/primitives'
import { useReview } from '../state/useReview'

interface Props {
  variantId: string
  onClose: () => void
  onDone: () => void
}

/** The human gate: draw blur masks over a representative frame, then approve. */
export function ReviewModal({ variantId, onClose, onDone }: Props) {
  const review = useReview(variantId)
  const [masks, setMasks] = useState<MaskRegion[]>([])
  const [draft, setDraft] = useState<MaskRegion | null>(null)
  const [busy, setBusy] = useState<null | 'approve' | 'reject'>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (review.info) setMasks(review.info.masks)
  }, [review.info])

  const norm = (e: PointerEvent): { x: number; y: number } => {
    const r = stageRef.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    }
  }

  const onDown = (e: PointerEvent): void => {
    startRef.current = norm(e)
    setDraft({ ...startRef.current, w: 0, h: 0 })
  }
  const onMove = (e: PointerEvent): void => {
    if (!startRef.current) return
    const p = norm(e)
    const s = startRef.current
    setDraft({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
  }
  const onUp = (): void => {
    if (draft && draft.w > 0.02 && draft.h > 0.02) setMasks((m) => [...m, draft])
    setDraft(null)
    startRef.current = null
  }

  const finish = async (action: 'approve' | 'reject'): Promise<void> => {
    setBusy(action)
    try {
      if (action === 'approve') await review.approve(masks)
      else await review.reject()
      onDone()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <strong>Make it safe to post</strong>
          <Badge tone="accent">safety check</Badge>
          <button className="modal__x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <p className="modal__hint">
          {review.info?.detectorAvailable
            ? 'Auto-detected regions are pre-filled. Add or correct masks, then approve.'
            : 'No detector model installed — drag to draw blur masks over anything that must be hidden, then approve. Export stays blocked until you do.'}
        </p>

        {review.loading ? (
          <div className="modal__stage modal__stage--loading">
            <Spinner />
          </div>
        ) : (
          <div
            className="modal__stage"
            ref={stageRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
          >
            {review.frameDataUrl && <img src={review.frameDataUrl} alt="Frame to review" draggable={false} />}
            {masks.map((m, i) => (
              <div
                key={i}
                className="modal__mask"
                style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` }}
              />
            ))}
            {draft && (
              <div
                className="modal__mask modal__mask--draft"
                style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.w * 100}%`, height: `${draft.h * 100}%` }}
              />
            )}
          </div>
        )}

        <div className="modal__foot">
          <span className="modal__count">{masks.length} mask(s)</span>
          <div className="modal__actions">
            {masks.length > 0 && (
              <Button onClick={() => setMasks([])} disabled={!!busy}>
                Clear
              </Button>
            )}
            <Button onClick={() => void finish('reject')} disabled={!!busy}>
              {busy === 'reject' ? 'Rejecting…' : 'Reject'}
            </Button>
            <Button variant="primary" onClick={() => void finish('approve')} disabled={!!busy}>
              {busy === 'approve' ? 'Approving…' : 'Approve & unlock export'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
