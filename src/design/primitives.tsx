import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import './primitives.css'

type Tone = 'default' | 'ok' | 'warn' | 'danger' | 'accent'

export function Button({
  variant = 'default',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' }) {
  return <button className={`vop-btn ${variant === 'primary' ? 'vop-btn--primary' : ''} ${className}`} {...rest} />
}

export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`vop-card ${className}`} {...rest} />
}

export function Badge({ tone = 'default', children }: { tone?: Tone; children: ReactNode }) {
  const cls = tone === 'default' ? '' : `vop-badge--${tone}`
  return (
    <span className={`vop-badge ${cls}`}>
      <span className="vop-badge__dot" aria-hidden />
      {children}
    </span>
  )
}

export function ProgressBar({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div className="vop-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="vop-progress__fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Spinner() {
  return <span className="vop-spinner" role="status" aria-label="Loading" />
}

export function Skeleton({ height = 16, width = '100%' }: { height?: number; width?: number | string }) {
  return <div className="vop-skeleton" style={{ height, width }} />
}

export function EmptyState({
  title,
  hint,
  icon,
  action,
}: {
  title: string
  hint?: string
  icon?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="vop-empty">
      {icon && <div className="vop-empty__icon">{icon}</div>}
      <div className="vop-empty__title">{title}</div>
      {hint && <div className="vop-empty__hint">{hint}</div>}
      {action && <div className="vop-empty__action">{action}</div>}
    </div>
  )
}
