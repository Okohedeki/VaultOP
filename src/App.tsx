import './App.css'
import { useState } from 'react'
import { useVault } from './state/useVault'
import { Dropzone } from './components/Dropzone'
import { AssetList } from './components/AssetList'
import { SegmentGrid } from './components/SegmentGrid'
import { SearchResults } from './components/SearchResults'
import { DeliverablesPanel } from './components/DeliverablesPanel'
import { ReviewModal } from './components/ReviewModal'
import { Tagger } from './editor/Tagger'
import { Builder } from './editor/Builder'
import { Badge } from './design/primitives'
import type { SearchMode } from './state/useSearch'
import type { Aspect } from '@shared/domain'

export function App() {
  const vault = useVault()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [buildMode, setBuildMode] = useState(false)
  const [draftMode, setDraftMode] = useState(false)
  const [query, setQuery] = useState('')

  const openDraft = (assetId: string): void => {
    setEditingId(assetId)
    setBuildMode(true)
    setDraftMode(true)
  }
  const exitEditor = (): void => {
    setEditingId(null)
    setBuildMode(false)
    setDraftMode(false)
  }
  const [similarTo, setSimilarTo] = useState<string | null>(null)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const selected = selectedId ? (vault.assets.find((a) => a.id === selectedId) ?? null) : null
  const editing = editingId ? (vault.assets.find((a) => a.id === editingId) ?? null) : null
  const activeCount = vault.jobs.filter((j) => j.state === 'queued' || j.state === 'running').length

  const searchMode: SearchMode | null = similarTo
    ? { kind: 'similar', segmentId: similarTo }
    : query.trim()
      ? { kind: 'text', query: query.trim() }
      : null

  const findSimilar = (segmentId: string): void => {
    setSimilarTo(segmentId)
    setSelectedId(null)
    setQuery('')
  }
  const clearSearch = (): void => {
    setSimilarTo(null)
    setQuery('')
  }
  const compileAspect: Aspect = 'widescreen'
  const jobProgressFor = (variantId: string): number | undefined =>
    vault.jobs.find((j) => j.targetId === variantId && j.state === 'running')?.progress

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <div className="app__logo">V</div>
          <h1>
            <span className="grad-text">Vault</span>OP
          </h1>
          <span className="tag">creator studio</span>
        </div>
        {activeCount > 0 ? (
          <Badge tone="accent">{activeCount} processing…</Badge>
        ) : (
          <Badge tone="ok">All caught up</Badge>
        )}
      </header>

      {editing ? (
        <div className="app__body app__body--editor">
          {buildMode ? (
            <Builder
              asset={editing}
              draft={draftMode}
              onBack={() => (draftMode ? exitEditor() : setBuildMode(false))}
              onRendered={exitEditor}
            />
          ) : (
            <Tagger asset={editing} onBack={exitEditor} onBuild={() => setBuildMode(true)} />
          )}
        </div>
      ) : (
      <div className="app__body">
        <main className="app__main">
          {selected ? (
            <SegmentGrid
              asset={selected}
              revision={selected.updatedAt}
              onBack={() => setSelectedId(null)}
              onEdit={(id) => setEditingId(id)}
              onQuickDraft={openDraft}
              onFindSimilar={findSimilar}
            />
          ) : searchMode ? (
            <div className="seg">
              <div className="seg__head">
                <button className="vop-btn" onClick={clearSearch} aria-label="Clear search">
                  ← Vault
                </button>
                <div className="seg__title">
                  <span className="seg__name">
                    {searchMode.kind === 'text'
                      ? `Results for “${searchMode.query}”`
                      : 'Visually similar scenes'}
                  </span>
                </div>
              </div>
              <SearchResults
                mode={searchMode}
                onFindSimilar={findSimilar}
                onCompile={(ids) => void vault.makeCompilation(ids, compileAspect)}
              />
            </div>
          ) : (
            <>
              <Dropzone onAdd={vault.addFiles} onPick={vault.pickAndAdd} />
              <input
                className="search-input"
                type="search"
                placeholder="Search the vault — tags, lighting, length…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search the vault"
              />
              <div className="section-title">
                Your vault{' '}
                <span>
                  · {vault.assets.length} clip{vault.assets.length === 1 ? '' : 's'}
                </span>
              </div>
              <AssetList
                loadState={vault.loadState}
                error={vault.error}
                assets={vault.assets}
                jobs={vault.jobs}
                onSelect={(a) => setSelectedId(a.id)}
              />
            </>
          )}
        </main>

        <aside className="app__side">
          <div className="section-title">Deliverables</div>
          <DeliverablesPanel
            variants={vault.variants}
            jobProgressFor={jobProgressFor}
            onExport={vault.exportVariant}
            onReview={setReviewingId}
            onMakePromos={vault.makePromos}
          />
        </aside>
      </div>
      )}

      {reviewingId && (
        <ReviewModal
          variantId={reviewingId}
          onClose={() => setReviewingId(null)}
          onDone={() => setReviewingId(null)}
        />
      )}
    </div>
  )
}
