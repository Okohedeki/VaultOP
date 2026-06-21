import { useEffect, useState, type ReactNode } from 'react'
import {
  ActivityIcon,
  BuildIcon,
  ChevronsIcon,
  CutsIcon,
  PlusIcon,
  SearchIcon,
  SparkleIcon,
  TagIcon,
  VaultIcon,
} from './icons'

export type View = 'vault' | 'tag' | 'build' | 'cuts' | 'promos' | 'activity'

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
  counts: {
    vault: number
    cuts: number
    promos: number
    pendingReview: number
    activeJobs: number
  }
}

const COLLAPSE_KEY = 'vaultop.sidebar.collapsed'

export function Sidebar({ view, onView, query, onQuery, onAdd, counts }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1')
    } catch {
      /* no storage (tests) — default expanded */
    }
  }, [])
  const toggle = (): void => {
    setCollapsed((c) => {
      const next = !c
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const items: NavItem[] = [
    { view: 'vault', label: 'Vault', icon: <VaultIcon />, count: counts.vault },
    { view: 'tag', label: 'Tag', icon: <TagIcon /> },
    { view: 'build', label: 'Build', icon: <BuildIcon /> },
    { view: 'cuts', label: 'Cuts', icon: <CutsIcon />, count: counts.cuts },
    {
      view: 'promos',
      label: 'Promos',
      icon: <SparkleIcon />,
      count: counts.promos,
      alert: counts.pendingReview,
    },
    { view: 'activity', label: 'Activity', icon: <ActivityIcon />, count: counts.activeJobs },
  ]

  return (
    <nav className={`side ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="side__top">
        <div className="side__brand">
          <div className="app__logo">V</div>
          <div className="app__brand">
            <h1>
              <span className="grad-text">Vault</span>OP
            </h1>
            <span className="tag">creator studio</span>
          </div>
        </div>
        <button
          className="side__collapse"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <ChevronsIcon />
        </button>
      </div>

      <button className="side__add" onClick={onAdd} title="Add footage">
        <PlusIcon width={16} height={16} />
        <span className="side__add-label">Add footage</span>
      </button>

      <div className="side__search">
        <span className="side__search-icon" aria-hidden>
          <SearchIcon width={15} height={15} />
        </span>
        {collapsed ? (
          <button
            className="side__search-btn"
            onClick={toggle}
            aria-label="Search"
            title="Search the vault"
          />
        ) : (
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
        )}
      </div>

      <div className="side__nav">
        {items.map((it) => (
          <button
            key={it.view}
            className={`side__item ${view === it.view ? 'is-active' : ''}`}
            onClick={() => onView(it.view)}
            data-view={it.view}
            title={it.label}
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
        <span className={`side__status ${counts.activeJobs > 0 ? 'is-busy' : ''}`}>
          <span className="side__status-dot" />
          <span className="side__status-label">
            {counts.activeJobs > 0 ? `${counts.activeJobs} processing…` : 'All caught up'}
          </span>
        </span>
      </div>
    </nav>
  )
}
