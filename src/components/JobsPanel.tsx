import type { Job } from '@shared/domain'
import { Badge, Card, EmptyState, ProgressBar, Spinner } from '../design/primitives'
import { ActivityIcon } from './icons'

const TONE: Record<Job['state'], 'default' | 'ok' | 'warn' | 'danger' | 'accent'> = {
  queued: 'default',
  running: 'accent',
  done: 'ok',
  failed: 'danger',
}

export function JobsPanel({ jobs }: { jobs: Job[] }) {
  const active = jobs.filter((j) => j.state === 'queued' || j.state === 'running')
  const recent = jobs.filter((j) => j.state === 'done' || j.state === 'failed').slice(0, 8)

  if (jobs.length === 0) {
    return (
      <EmptyState
        title="All quiet"
        hint="Encoding, scene-splitting, and renders show up here with live progress as you work."
        icon={<ActivityIcon width={30} height={30} />}
      />
    )
  }

  return (
    <div className="panel-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', overflow: 'auto' }}>
      {active.map((j) => (
        <Card key={j.id} className="job">
          <div className="job__row">
            <span className="job__type">
              {j.state === 'running' && <Spinner />} {j.type}
            </span>
            <Badge tone={TONE[j.state]}>{j.state}</Badge>
          </div>
          <ProgressBar value={j.progress} />
        </Card>
      ))}
      {recent.map((j) => (
        <Card key={j.id} className="job">
          <div className="job__row">
            <span className="job__type">{j.type}</span>
            <Badge tone={TONE[j.state]}>{j.state}</Badge>
          </div>
          {j.state === 'failed' && j.error && (
            <div className="asset__error">⚠ {j.error}</div>
          )}
        </Card>
      ))}
    </div>
  )
}
