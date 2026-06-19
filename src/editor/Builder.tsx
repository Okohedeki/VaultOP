import { useCallback, useEffect, useState } from 'react'
import type { Asset, Aspect, Section } from '@shared/domain'
import { Badge, Button, EmptyState, Spinner } from '../design/primitives'
import { useSections } from '../state/useSections'
import { getBridge } from '../lib/bridge'
import './editor.css'

interface Props {
  asset: Asset
  onBack: () => void
  /** Called after a Cut is queued — return to the vault to watch it render. */
  onRendered: () => void
}

interface Clip {
  uid: string
  sectionId: string | null
  masterId: string
  startMs: number
  endMs: number
  speed: number
  label: string
}

const SPEEDS = [0.5, 1, 1.5, 2]
const ASPECTS: { key: Aspect; label: string; note: string }[] = [
  { key: 'vertical', label: '9:16', note: 'TikTok / Reels' },
  { key: 'square', label: '1:1', note: 'Feed' },
  { key: 'widescreen', label: '16:9', note: 'YouTube' },
]

function secs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}
function clipOut(c: Clip): number {
  return Math.round((c.endMs - c.startMs) / c.speed)
}

export function Builder({ asset, onBack, onRendered }: Props) {
  const sx = useSections(asset.id)
  const [scope, setScope] = useState<'clip' | 'library'>('clip')
  const [tag, setTag] = useState('')
  const [pool, setPool] = useState<Section[]>([])
  const [poolBusy, setPoolBusy] = useState(false)
  const [clips, setClips] = useState<Clip[]>([])
  const [aspect, setAspect] = useState<Aspect>('vertical')
  const [rendering, setRendering] = useState(false)

  const master = sx.master

  // Resolve the Section pool from the scope + tag filter.
  useEffect(() => {
    if (!master) return
    const t = tag.trim()
    if (scope === 'clip' && !t) {
      setPool(sx.sections)
      return
    }
    if (!t) {
      setPool([]) // library scope needs a tag to pool across shoots
      return
    }
    let cancelled = false
    setPoolBusy(true)
    getBridge()
      .invoke('sections:byTag', { value: t, masterId: scope === 'clip' ? master.id : null })
      .then((r) => {
        if (!cancelled) setPool(r.sections)
      })
      .finally(() => {
        if (!cancelled) setPoolBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [scope, tag, master, sx.sections])

  const add = useCallback((s: Section) => {
    setClips((cs) => [
      ...cs,
      {
        uid: window.crypto.randomUUID(),
        sectionId: s.id,
        masterId: s.masterId,
        startMs: s.startMs,
        endMs: s.endMs,
        speed: 1,
        label: s.label || s.tags[0]?.value || 'section',
      },
    ])
  }, [])

  const move = (i: number, dir: -1 | 1): void => {
    setClips((cs) => {
      const j = i + dir
      if (j < 0 || j >= cs.length) return cs
      const next = [...cs]
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      return next
    })
  }
  const setSpeed = (uid: string, speed: number): void =>
    setClips((cs) => cs.map((c) => (c.uid === uid ? { ...c, speed } : c)))
  const removeClip = (uid: string): void => setClips((cs) => cs.filter((c) => c.uid !== uid))

  const totalMs = clips.reduce((n, c) => n + clipOut(c), 0)

  const render = useCallback(async () => {
    if (clips.length === 0) return
    setRendering(true)
    try {
      await getBridge().invoke('cut:create', {
        edl: {
          aspect,
          clips: clips.map((c) => ({
            sectionId: c.sectionId,
            masterId: c.masterId,
            startMs: c.startMs,
            endMs: c.endMs,
            speed: c.speed,
            label: c.label,
          })),
        },
      })
      onRendered()
    } finally {
      setRendering(false)
    }
  }, [clips, aspect, onRendered])

  if (sx.loadState === 'loading') {
    return (
      <div className="ed ed--center">
        <Spinner />
        <p>Opening builder…</p>
      </div>
    )
  }
  if (sx.loadState === 'error' || !master) {
    return (
      <div className="ed">
        <div className="ed__head">
          <Button onClick={onBack}>← Tagger</Button>
        </div>
        <EmptyState title="Can’t open the builder" hint={sx.error ?? undefined} />
      </div>
    )
  }

  return (
    <div className="ed">
      <div className="ed__head">
        <Button onClick={onBack} aria-label="Back to tagger">
          ← Tagger
        </Button>
        <div className="ed__title">
          <span className="ed__name">{asset.originalFilename}</span>
          <Badge tone="accent">Builder</Badge>
        </div>
        <div className="ed__head-actions">
          <span className="bld__total">
            {clips.length} clip{clips.length === 1 ? '' : 's'} · {secs(totalMs)}
          </span>
          <Button variant="primary" disabled={clips.length === 0 || rendering} onClick={render}>
            {rendering ? 'Rendering…' : '▶ Render Cut'}
          </Button>
        </div>
      </div>

      <div className="bld">
        {/* Section pool */}
        <aside className="bld__pool">
          <div className="bld__scope">
            <button
              className={scope === 'clip' ? 'is-on' : ''}
              onClick={() => setScope('clip')}
            >
              This clip
            </button>
            <button
              className={scope === 'library' ? 'is-on' : ''}
              onClick={() => setScope('library')}
            >
              Whole library
            </button>
          </div>
          <input
            className="bld__filter"
            value={tag}
            placeholder={scope === 'library' ? 'tag to pool across shoots…' : 'filter by tag…'}
            onChange={(e) => setTag(e.target.value)}
          />
          <div className="bld__pool-list">
            {poolBusy && <Spinner />}
            {!poolBusy && pool.length === 0 && (
              <p className="bld__empty">
                {scope === 'library' && !tag.trim()
                  ? 'Type a tag to gather matching sections from every shoot.'
                  : 'No matching sections.'}
              </p>
            )}
            {pool.map((s) => (
              <div key={s.id} className="bld__row">
                <button className="bld__add" onClick={() => add(s)} aria-label="Add to cut">
                  ＋
                </button>
                <div className="bld__row-main">
                  <span className="bld__row-label">
                    {s.favorite ? '★ ' : ''}
                    {s.label || s.tags[0]?.value || 'section'}
                  </span>
                  <span className="bld__row-meta">
                    {secs(s.endMs - s.startMs)}
                    {s.tags.length > 0 ? ` · ${s.tags.map((t) => t.value).join(', ')}` : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* The cut */}
        <section className="bld__cut">
          <div className="bld__aspect">
            {ASPECTS.map((a) => (
              <button
                key={a.key}
                className={aspect === a.key ? 'is-on' : ''}
                onClick={() => setAspect(a.key)}
              >
                <strong>{a.label}</strong>
                <em>{a.note}</em>
              </button>
            ))}
          </div>

          {clips.length === 0 ? (
            <EmptyState
              title="Your cut is empty"
              hint="Add sections from the left to assemble a cut. Reorder, trim by speed, then render."
            />
          ) : (
            <ol className="bld__track">
              {clips.map((c, i) => (
                <li key={c.uid} className="bld__clip">
                  <span className="bld__clip-n">{i + 1}</span>
                  <div className="bld__clip-main">
                    <span className="bld__clip-label">{c.label}</span>
                    <span className="bld__clip-meta">
                      {secs(c.endMs - c.startMs)} → {secs(clipOut(c))}
                    </span>
                  </div>
                  <select
                    className="bld__speed"
                    value={c.speed}
                    onChange={(e) => setSpeed(c.uid, Number(e.target.value))}
                    aria-label="Clip speed"
                  >
                    {SPEEDS.map((s) => (
                      <option key={s} value={s}>
                        {s}×
                      </option>
                    ))}
                  </select>
                  <div className="bld__clip-ord">
                    <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                      ▲
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === clips.length - 1}
                      aria-label="Move down"
                    >
                      ▼
                    </button>
                  </div>
                  <button className="bld__clip-x" onClick={() => removeClip(c.uid)} aria-label="Remove clip">
                    ✕
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}
