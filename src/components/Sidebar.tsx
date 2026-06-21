import type { ReactNode } from 'react'

export type View = 'vault' | 'deliverables' | 'activity'

interface NavItem {
  view: View
  label: string
  icon: ReactNode
  count?: number
  alert?: number // e.g. promos awaiting the blur gate
}

interface Props {
  view: View
  onView: (v: View) => void
  query: string
  onQuery: (q: string) => void
  onAdd: () => void
  counts: { vault: number; deliverables: number; pendingReview: number; activeJobs: number }
}

export function Sidebar({ view, onView, query, onQuery, onAdd, counts }: Props) {
  const items: NavItem[] = [
    { view: 'vault', label: 'Vault', icon: '▦', count: counts.vault },
    {
      view: 'deliverables',
      label: 'Deliverables',
      icon: '✦',
      count: counts.deliverables,
      alert: counts.pendingReview,
    },
    { view: 'activity', label: 'Activity', icon: '◴', count: counts.activeJobs },
  ]

  return (
    <nav className="side">
      <div className="side__brand">
        <div className="app__logo">V</div>
        <div className="app__brand">
          <h1>
            <span className="grad-text">Vault</span>OP
          </h1>
          <span className="tag">creator studio</span>
        </div>
      </div>

      <button className="side__add" onClick={onAdd}>
        <span className="side__add-plus">＋</span> Add footage
      </button>

      <div className="side__search">
        <span className="side__search-icon" aria-hidden>
          ⌕
        </span>
        <input
          type="search"
          placeholder="Search the vault…"
          value={query}
          onChange={(e) => {
            onQuery(e.target.value)
            if (e.target.value.trim()) onView('vault')
          }}
          aria-label="Search the vault"
        />
      </div>

      <div className="side__nav">
        {items.map((it) => (
          <button
            key={it.view}
            className={`side__item ${view === it.view ? 'is-active' : ''}`}
            onClick={() => onView(it.view)}
            data-view={it.view}
          >
            <span className="side__item-icon" aria-hidden>
              {it.icon}
            </span>
            <span className="side__item-label">{it.label}</span>
            {it.alert ? (
              <span className="side__item-alert" title={`${it.alert} awaiting review`}>
                {it.alert}
              </span>
            ) : it.count ? (
              <span className="side__item-count">{it.count}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="side__foot">
        {counts.activeJobs > 0 ? (
          <span className="side__status is-busy">
            <span className="side__status-dot" /> {counts.activeJobs} processing…
          </span>
        ) : (
          <span className="side__status">
            <span className="side__status-dot" /> All caught up
          </span>
        )}
      </div>
    </nav>
  )
}
