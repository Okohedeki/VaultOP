import './App.css'
import { useState } from 'react'
import { useVault } from './state/useVault'
import { Dropzone } from './components/Dropzone'
import { AssetList } from './components/AssetList'
import { SegmentGrid } from './components/SegmentGrid'
import { SearchResults } from './components/SearchResults'
import { DeliverablesPanel } from './components/DeliverablesPanel'
import { JobsPanel } from './components/JobsPanel'
import { ReviewModal } from './components/ReviewModal'
import { Sidebar, type View } from './components/Sidebar'
import { Tagger } from './editor/Tagger'
import { Builder } from './editor/Builder'
import type { SearchMode } from './state/useSearch'
import type { Aspect } from '@shared/domain'

export function App() {
  const vault = useVault()
  const [view, setView] = useState<View>('vault')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [buildMode, setBuildMode] = useState(false)
  const [draftMode, setDraftMode] = useState(false)
  const [query, setQuery] = useState('')
  const [similarTo, setSimilarTo] = useState<string | null>(null)
  const [reviewingId, setReviewingId] = useState<string | null>(null)

  const selected = selectedId ? (vault.assets.find((a) => a.id === selectedId) ?? null) : null
  const editing = editingId ? (vault.assets.find((a) => a.id === editingId) ?? null) : null
  const activeCount = vault.jobs.filter((j) => j.state === 'queued' || j.state === 'running').length
  // Cuts are un-gated edits; Promos are the platform-bound, gated artifacts.
  const cuts = vault.variants.filter((v) => !v.requiresReview)
  const promos = vault.variants.filter((v) => v.requiresReview)
  const pendingReview = promos.filter((v) => v.reviewState === 'pending').length

  const openDraft = (assetId: string): void => {
    setEditingId(assetId)
    setBuildMode(true)
    setDraftMode(true)
  }
  // Open a chosen clip in the editor (Tag or Build) — used by the sidebar pickers.
  const openClip = (assetId: string, build: boolean): void => {
    setEditingId(assetId)
    setBuildMode(build)
    setDraftMode(false)
  }
  const exitEditor = (): void => {
    setEditingId(null)
    setBuildMode(false)
    setDraftMode(false)
  }
  // After a render, drop the creator straight into Cuts to watch the new Cut finish.
  const finishRender = (): void => {
    exitEditor()
    setSelectedId(null)
    setView('cuts')
  }
  const makePromosAndShow = async (cutVariantId: string, platforms: string[]): Promise<void> => {
    await vault.makePromos(cutVariantId, platforms)
    setView('promos')
  }

  const searchMode: SearchMode | null = similarTo
    ? { kind: 'similar', segmentId: similarTo }
    : query.trim()
      ? { kind: 'text', query: query.trim() }
      : null

  const findSimilar = (segmentId: string): void => {
    setSimilarTo(segmentId)
    setSelectedId(null)
    setView('vault')
  }
  const clearSearch = (): void => {
    setSimilarTo(null)
    setQuery('')
  }
  const goView = (v: View): void => {
    setView(v)
    setSelectedId(null)
    setSimilarTo(null)
  }

  const compileAspect: Aspect = 'widescreen'
  const jobProgressFor = (variantId: string): number | undefined =>
    vault.jobs.find((j) => j.targetId === variantId && j.state === 'running')?.progress

  // The editor is a focused, full-window takeover (no sidebar).
  if (editing) {
    return (
      <div className="app app--editor">
        {buildMode ? (
          <Builder
            asset={editing}
            draft={draftMode}
            onBack={() => (draftMode ? exitEditor() : setBuildMode(false))}
            onRendered={finishRender}
          />
        ) : (
          <Tagger asset={editing} onBack={exitEditor} onBuild={() => setBuildMode(true)} />
        )}
      </div>
    )
  }

  return (
    <div className="app">
      <Sidebar
        view={view}
        onView={goView}
        query={query}
        onQuery={setQuery}
        onAdd={vault.pickAndAdd}
        counts={{
          vault: vault.assets.length,
          cuts: cuts.length,
          promos: promos.length,
          pendingReview,
          activeJobs: activeCount,
        }}
      />

      <main className="content">
        {view === 'vault' &&
          (selected ? (
            <SegmentGrid
              asset={selected}
              revision={selected.updatedAt}
              onBack={() => setSelectedId(null)}
              onEdit={(id) => setEditingId(id)}
              onQuickDraft={openDraft}
              onFindSimilar={findSimilar}
            />
          ) : searchMode ? (
            <div className="view">
              <header className="view__head">
                <button className="vop-btn" onClick={clearSearch} aria-label="Clear search">
                  ← Vault
                </button>
                <h2 className="view__title">
                  {searchMode.kind === 'text'
                    ? `Results for “${searchMode.query}”`
                    : 'Visually similar scenes'}
                </h2>
              </header>
              <SearchResults
                mode={searchMode}
                onFindSimilar={findSimilar}
                onCompile={(ids) => void vault.makeCompilation(ids, compileAspect)}
              />
            </div>
          ) : (
            <div className="view">
              <header className="view__head">
                <h2 className="view__title">
                  Your vault{' '}
                  <span className="view__sub">
                    · {vault.assets.length} clip{vault.assets.length === 1 ? '' : 's'}
                  </span>
                </h2>
              </header>
              <Dropzone onAdd={vault.addFiles} onPick={vault.pickAndAdd} />
              <AssetList
                loadState={vault.loadState}
                error={vault.error}
                assets={vault.assets}
                jobs={vault.jobs}
                onSelect={(a) => setSelectedId(a.id)}
              />
            </div>
          ))}

        {(view === 'tag' || view === 'build') && (
          <div className="view">
            <header className="view__head">
              <h2 className="view__title">
                {view === 'tag' ? 'Tag' : 'Build'}{' '}
                <span className="view__sub">
                  · pick a clip to {view === 'tag' ? 'tag' : 'build from'}
                </span>
              </h2>
            </header>
            <AssetList
              loadState={vault.loadState}
              error={vault.error}
              assets={vault.assets}
              jobs={vault.jobs}
              onSelect={(a) => openClip(a.id, view === 'build')}
            />
          </div>
        )}

        {view === 'cuts' && (
          <div className="view">
            <header className="view__head">
              <h2 className="view__title">
                Cuts{' '}
                <span className="view__sub">
                  · {cuts.length} cut{cuts.length === 1 ? '' : 's'}
                </span>
              </h2>
            </header>
            <DeliverablesPanel
              variants={cuts}
              jobProgressFor={jobProgressFor}
              onExport={vault.exportVariant}
              onReview={setReviewingId}
              onMakePromos={makePromosAndShow}
              emptyHint="Build a cut from your tagged sections to get started."
            />
          </div>
        )}

        {view === 'promos' && (
          <div className="view">
            <header className="view__head">
              <h2 className="view__title">
                Promos{' '}
                <span className="view__sub">
                  · {promos.length} promo{promos.length === 1 ? '' : 's'}
                </span>
              </h2>
            </header>
            <DeliverablesPanel
              variants={promos}
              jobProgressFor={jobProgressFor}
              onExport={vault.exportVariant}
              onReview={setReviewingId}
              onMakePromos={makePromosAndShow}
              emptyHint="Open a Cut and “Make Promos” to create platform-ready, gated promos."
            />
          </div>
        )}

        {view === 'activity' && (
          <div className="view">
            <header className="view__head">
              <h2 className="view__title">Activity</h2>
            </header>
            <JobsPanel jobs={vault.jobs} />
          </div>
        )}
      </main>

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
