import type { AssetStatus } from '@shared/domain'

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

export function statusTone(s: AssetStatus): 'default' | 'ok' | 'warn' | 'danger' | 'accent' {
  switch (s) {
    case 'ready':
      return 'ok'
    case 'failed':
      return 'danger'
    case 'transcoding':
    case 'analyzing':
      return 'accent'
    default:
      return 'default'
  }
}
