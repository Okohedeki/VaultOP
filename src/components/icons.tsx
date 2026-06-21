// Small, crisp line icons (stroke = currentColor) for the sidebar + chrome.
// Hand-rolled SVGs so we don't pull an icon library for a handful of glyphs.

import type { SVGProps } from 'react'

const base = (props: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> => ({
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props,
})

/** Vault / library — a film strip. */
export function VaultIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M3 15h18M8 4v16M16 4v16" />
    </svg>
  )
}

/** Deliverables — sparkles (cuts & promos ready to post). */
export function SparkleIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(p)}>
      <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" />
      <path d="M18.5 14.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </svg>
  )
}

/** Activity — a pulse/heartbeat line. */
export function ActivityIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(p)}>
      <path d="M3 12h4l2.5-6 4 14L17 12h4" />
    </svg>
  )
}

/** Tag — a label with a punch hole (the Tagger). */
export function TagIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(p)}>
      <path d="M12 3H5a2 2 0 0 0-2 2v7l9 9 9-9-9-9z" />
      <circle cx="7.5" cy="7.5" r="1.3" />
    </svg>
  )
}

/** Build — scissors (assemble/cut Sections into a Cut). */
export function BuildIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(p)}>
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="6" cy="18" r="2.4" />
      <path d="M8.1 7.7L20 16M8.1 16.3L20 8" />
    </svg>
  )
}

/** Cuts — a play triangle in a frame (a rendered edit). */
export function CutsIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M10 8.5l5 3.5-5 3.5z" />
    </svg>
  )
}

export function SearchIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(p)}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  )
}

export function PlusIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(p)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

/** Collapse/expand chevrons. */
export function ChevronsIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(p)}>
      <path d="M11 7l-5 5 5 5M18 7l-5 5 5 5" />
    </svg>
  )
}
