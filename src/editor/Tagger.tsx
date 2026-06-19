import { useCallback, useEffect, useRef, useState } from 'react'
import type { Asset, Section } from '@shared/domain'
import { Badge, Button, EmptyState, Spinner } from '../design/primitives'
import { useSections } from '../state/useSections'
import { Timeline } from './Timeline'
import './editor.css'

interface Props {
  asset: Asset
  onBack: () => void
  onBuild?: () => void
}

function fmt(ms: number): string {
  const t = Math.max(0, ms / 1000)
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  const cs = Math.floor((t * 100) % 100)
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

const ZOOMS = [4, 8, 16, 32, 64, 120]

export function Tagger({ asset, onBack, onBuild }: Props) {
  const sx = useSections(asset.id)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [currentMs, setCurrentMs] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [inMs, setInMs] = useState<number | null>(null)
  const [outMs, setOutMs] = useState<number | null>(null)
  const [zoom, setZoom] = useState(16)
  const [tagDraft, setTagDraft] = useState('')

  const durationMs = sx.master?.durationMs ?? 0
  const selected = sx.sections.find((s) => s.id === selectedId) ?? null

  const seek = useCallback((ms: number) => {
    const v = videoRef.current
    const clamped = Math.max(0, ms)
    if (v) v.currentTime = clamped / 1000
    setCurrentMs(clamped)
  }, [])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) void v.play()
    else v.pause()
  }, [])

  // Smooth playhead while playing (timeupdate alone is too coarse).
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = (): void => {
      const v = videoRef.current
      if (v) setCurrentMs(v.currentTime * 1000)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const createFromMarkers = useCallback(() => {
    if (inMs == null || outMs == null || outMs - inMs < 200) return
    void sx.create({ startMs: inMs, endMs: outMs })
    setInMs(null)
    setOutMs(null)
  }, [inMs, outMs, sx])

  const splitSelected = useCallback(() => {
    if (!selected) return
    if (currentMs <= selected.startMs + 100 || currentMs >= selected.endMs - 100) return
    void sx.update(selected.id, { endMs: Math.round(currentMs) })
    void sx.create({ startMs: Math.round(currentMs), endMs: selected.endMs, label: selected.label })
  }, [selected, currentMs, sx])

  // Keyboard transport — space/play, i/o markers, s split, delete.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return
      if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'i') setInMs(Math.round(currentMs))
      else if (e.key === 'o') setOutMs(Math.round(currentMs))
      else if (e.key === 's') splitSelected()
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        void sx.remove(selected.id)
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [currentMs, selected, togglePlay, splitSelected, sx])

  const addTag = (): void => {
    const v = tagDraft.trim()
    if (v && selected) void sx.addTag(selected.id, v)
    setTagDraft('')
  }

  if (sx.loadState === 'loading') {
    return (
      <div className="ed ed--center">
        <Spinner />
        <p>Opening editor…</p>
      </div>
    )
  }
  if (sx.loadState === 'error' || !sx.master) {
    return (
      <div className="ed">
        <div className="ed__head">
          <Button onClick={onBack}>← Vault</Button>
        </div>
        <EmptyState title="Can’t open this clip yet" hint={sx.error ?? undefined} />
      </div>
    )
  }

  return (
    <div className="ed">
      <div className="ed__head">
        <Button onClick={onBack} aria-label="Back to vault">
          ← Vault
        </Button>
        <div className="ed__title">
          <span className="ed__name">{asset.originalFilename}</span>
          <Badge tone="accent">Tagger</Badge>
        </div>
        <div className="ed__head-actions">
          <Badge tone="ok">
            {sx.sections.length} section{sx.sections.length === 1 ? '' : 's'}
          </Badge>
          {onBuild && (
            <Button variant="primary" onClick={onBuild}>
              ⧉ Build Cut →
            </Button>
          )}
        </div>
      </div>

      <div className="ed__stage">
        <div className="ed__player">
          {sx.mediaUrl ? (
            <video
              ref={videoRef}
              className="ed__video"
              src={sx.mediaUrl}
              onClick={togglePlay}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={(e) => {
                if (!playing) setCurrentMs(e.currentTarget.currentTime * 1000)
              }}
            />
          ) : (
            <div className="ed__video ed__video--blank">decrypting…</div>
          )}
          <div className="ed__transport">
            <button className="ed__play" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? '❚❚' : '►'}
            </button>
            <span className="ed__time">
              {fmt(currentMs)} <em>/ {fmt(durationMs)}</em>
            </span>
            <div className="ed__spacer" />
            <button className="ed__mark" onClick={() => setInMs(Math.round(currentMs))}>
              ⟦ In {inMs != null ? fmt(inMs) : ''}
            </button>
            <button className="ed__mark" onClick={() => setOutMs(Math.round(currentMs))}>
              Out {outMs != null ? fmt(outMs) : ''} ⟧
            </button>
            <Button
              variant="primary"
              disabled={inMs == null || outMs == null || (outMs ?? 0) - (inMs ?? 0) < 200}
              onClick={createFromMarkers}
            >
              ＋ Section
            </Button>
          </div>
        </div>

        <aside className="ed__inspector">
          {selected ? (
            <SectionInspector
              key={selected.id}
              section={selected}
              onSeek={seek}
              onLabel={(label) => void sx.update(selected.id, { label })}
              onFavorite={(fav) => void sx.update(selected.id, { favorite: fav })}
              onDelete={() => {
                void sx.remove(selected.id)
                setSelectedId(null)
              }}
              onRemoveTag={(v) => void sx.removeTag(selected.id, v)}
              tagDraft={tagDraft}
              setTagDraft={setTagDraft}
              onAddTag={addTag}
            />
          ) : (
            <div className="ed__hint">
              <h3>Tag your sections</h3>
              <p>
                Scenes are pre-drawn below. Click a block to select it, drag its edges to
                trim, then add tags. Or mark <kbd>I</kbd>/<kbd>O</kbd> and hit ＋ Section to
                carve a new one.
              </p>
              <p className="ed__hint-keys">
                <kbd>Space</kbd> play · <kbd>I</kbd>/<kbd>O</kbd> in/out · <kbd>S</kbd> split ·
                <kbd>Del</kbd> remove
              </p>
            </div>
          )}
        </aside>
      </div>

      <div className="ed__timeline">
        <div className="ed__tlbar">
          <button className="ed__tool" onClick={splitSelected} disabled={!selected} title="Split at playhead (S)">
            ✂ Split
          </button>
          <div className="ed__spacer" />
          <button className="ed__tool" onClick={() => setZoom(stepZoom(zoom, -1))} aria-label="Zoom out">
            －
          </button>
          <span className="ed__zoom">{zoom}px/s</span>
          <button className="ed__tool" onClick={() => setZoom(stepZoom(zoom, 1))} aria-label="Zoom in">
            ＋
          </button>
        </div>
        <Timeline
          durationMs={durationMs}
          currentMs={currentMs}
          sections={sx.sections}
          selectedId={selectedId}
          pxPerSec={zoom}
          onSeek={seek}
          onSelect={(id) => {
            setSelectedId(id)
            const s = sx.sections.find((x) => x.id === id)
            if (s) seek(s.startMs)
          }}
          onTrim={(id, startMs, endMs) => void sx.update(id, { startMs, endMs })}
        />
      </div>
    </div>
  )
}

function stepZoom(z: number, dir: number): number {
  const i = ZOOMS.indexOf(z)
  const base = i === -1 ? 2 : i
  return ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, base + dir))] ?? z
}

interface InspectorProps {
  section: Section
  onSeek: (ms: number) => void
  onLabel: (label: string) => void
  onFavorite: (fav: boolean) => void
  onDelete: () => void
  onRemoveTag: (value: string) => void
  tagDraft: string
  setTagDraft: (v: string) => void
  onAddTag: () => void
}

function SectionInspector({
  section,
  onSeek,
  onLabel,
  onFavorite,
  onDelete,
  onRemoveTag,
  tagDraft,
  setTagDraft,
  onAddTag,
}: InspectorProps) {
  const [label, setLabel] = useState(section.label ?? '')
  return (
    <div className="insp">
      <div className="insp__top">
        <button
          className={`insp__star ${section.favorite ? 'is-on' : ''}`}
          onClick={() => onFavorite(!section.favorite)}
          aria-label="Toggle favorite"
        >
          {section.favorite ? '★' : '☆'}
        </button>
        <button className="insp__del" onClick={onDelete} aria-label="Delete section">
          🗑
        </button>
      </div>
      <input
        className="insp__label"
        value={label}
        placeholder="Name this section…"
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => onLabel(label.trim())}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <button className="insp__range" onClick={() => onSeek(section.startMs)}>
        {fmt(section.startMs)} – {fmt(section.endMs)} · {((section.endMs - section.startMs) / 1000).toFixed(1)}s
      </button>

      <div className="insp__tags-h">Tags</div>
      <div className="insp__tags">
        {section.tags.length === 0 && <span className="insp__notags">No tags yet</span>}
        {section.tags.map((t) => (
          <span key={t.value} className={`chip ${t.source === 'ai' ? 'chip--ai' : ''}`}>
            {t.value}
            <button onClick={() => onRemoveTag(t.value)} aria-label={`Remove ${t.value}`}>
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="insp__addtag">
        <input
          value={tagDraft}
          placeholder="add tag (e.g. reveal)…"
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAddTag()}
        />
        <button onClick={onAddTag}>＋</button>
      </div>
    </div>
  )
}
