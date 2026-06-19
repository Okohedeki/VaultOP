import { useEffect, useRef, useState } from 'react'
import type { Section } from '@shared/domain'

interface DragState {
  id: string
  edge: 'start' | 'end' | 'move'
  startMs: number
  endMs: number
  grabMs: number // pointer ms at drag start (for 'move')
}

interface Props {
  durationMs: number
  currentMs: number
  sections: Section[]
  selectedId: string | null
  pxPerSec: number
  onSeek: (ms: number) => void
  onSelect: (id: string) => void
  /** Committed once on pointer-up. */
  onTrim: (id: string, startMs: number, endMs: number) => void
}

const TICK_TARGET_PX = 90 // aim for one labelled tick roughly every this many px

/** Pick a "nice" tick interval (seconds) so labels never crowd. */
function tickStepSec(pxPerSec: number): number {
  const raw = TICK_TARGET_PX / pxPerSec
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600]
  return steps.find((s) => s >= raw) ?? 600
}

function fmt(ms: number): string {
  const t = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(t / 60)
  const s = t % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function Timeline({
  durationMs,
  currentMs,
  sections,
  selectedId,
  pxPerSec,
  onSeek,
  onSelect,
  onTrim,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const width = Math.max(1, (durationMs / 1000) * pxPerSec)
  const msToX = (ms: number): number => (ms / 1000) * pxPerSec
  const xToMs = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return 0
    const ms = ((clientX - rect.left) / pxPerSec) * 1000
    return Math.max(0, Math.min(durationMs, Math.round(ms)))
  }

  // Live geometry for a section while dragging (otherwise its stored values).
  const geom = (s: Section): { startMs: number; endMs: number } => {
    if (drag && drag.id === s.id) return { startMs: drag.startMs, endMs: drag.endMs }
    return { startMs: s.startMs, endMs: s.endMs }
  }

  useEffect(() => {
    if (!drag) return
    const move = (e: PointerEvent): void => {
      const ms = xToMs(e.clientX)
      setDrag((d) => {
        if (!d) return d
        if (d.edge === 'start') return { ...d, startMs: Math.min(ms, d.endMs - 200) }
        if (d.edge === 'end') return { ...d, endMs: Math.max(ms, d.startMs + 200) }
        const span = d.endMs - d.startMs
        let start = d.startMs + (ms - d.grabMs)
        start = Math.max(0, Math.min(start, durationMs - span))
        return { ...d, startMs: start, endMs: start + span, grabMs: ms }
      })
    }
    const up = (): void => {
      setDrag((d) => {
        if (d) onTrim(d.id, Math.round(d.startMs), Math.round(d.endMs))
        return null
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id, drag?.edge])

  const step = tickStepSec(pxPerSec)
  const ticks: number[] = []
  for (let t = 0; t * 1000 <= durationMs; t += step) ticks.push(t)

  return (
    <div className="tl">
      <div
        ref={trackRef}
        className="tl__track"
        style={{ width }}
        onPointerDown={(e) => {
          // Click on empty track = seek (ignore clicks that originate on a block/handle).
          if ((e.target as HTMLElement).closest('.tl__block')) return
          onSeek(xToMs(e.clientX))
        }}
      >
        <div className="tl__ruler">
          {ticks.map((t) => (
            <div key={t} className="tl__tick" style={{ left: msToX(t * 1000) }}>
              <span>{fmt(t * 1000)}</span>
            </div>
          ))}
        </div>

        <div className="tl__lane">
          {sections.map((s) => {
            const g = geom(s)
            const left = msToX(g.startMs)
            const w = Math.max(6, msToX(g.endMs) - left)
            const sel = s.id === selectedId
            return (
              <div
                key={s.id}
                className={`tl__block ${sel ? 'is-selected' : ''} ${s.source === 'scene' ? 'is-scene' : 'is-manual'}`}
                style={{ left, width: w }}
                onPointerDown={(e) => {
                  if ((e.target as HTMLElement).classList.contains('tl__handle')) return
                  onSelect(s.id)
                  setDrag({ id: s.id, edge: 'move', startMs: g.startMs, endMs: g.endMs, grabMs: xToMs(e.clientX) })
                }}
                title={s.label ?? `${fmt(g.startMs)}–${fmt(g.endMs)}`}
              >
                <span
                  className="tl__handle tl__handle--l"
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    onSelect(s.id)
                    setDrag({ id: s.id, edge: 'start', startMs: g.startMs, endMs: g.endMs, grabMs: 0 })
                  }}
                />
                <span className="tl__block-label">
                  {s.favorite ? '★ ' : ''}
                  {s.label || (s.tags[0]?.value ?? 'section')}
                  {s.tags.length > 0 ? <em className="tl__block-tags"> · {s.tags.length}</em> : null}
                </span>
                <span
                  className="tl__handle tl__handle--r"
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    onSelect(s.id)
                    setDrag({ id: s.id, edge: 'end', startMs: g.startMs, endMs: g.endMs, grabMs: 0 })
                  }}
                />
              </div>
            )
          })}
        </div>

        <div className="tl__playhead" style={{ left: msToX(currentMs) }} />
      </div>
    </div>
  )
}
