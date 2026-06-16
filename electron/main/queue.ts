// SQLite-backed durable job queue with two worker lanes.
//
// The CPU lane (transcode, scene-split, thumbnails, ffmpeg) scales freely; the GPU
// lane (later: detection, CLIP, whisper) is the serialized bottleneck. Jobs are
// idempotent via input_hash, retried up to maxAttempts, and every failure is left
// visible on the row (state='failed', error set) — never swallowed.

import type { Job, JobType, WorkerClass } from '@shared/domain'
import type { Repo } from './repo'
import { errorMessage, log } from './log'

export interface JobContext {
  job: Job
  repo: Repo
  setProgress: (p: number) => void
}

export type JobHandler = (ctx: JobContext) => Promise<void>

export interface QueueOptions {
  maxAttempts?: number
  pollMs?: number
  onChanged?: () => void
}

const LANES: readonly WorkerClass[] = ['cpu', 'gpu']

export class Queue {
  private readonly handlers = new Map<JobType, JobHandler>()
  private readonly maxAttempts: number
  private readonly pollMs: number
  private readonly onChanged: () => void
  private running = false
  private laneBusy: Record<WorkerClass, boolean> = { cpu: false, gpu: false }
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly repo: Repo,
    opts: QueueOptions = {},
  ) {
    this.maxAttempts = opts.maxAttempts ?? 3
    this.pollMs = opts.pollMs ?? 250
    this.onChanged = opts.onChanged ?? (() => {})
  }

  register(type: JobType, handler: JobHandler): void {
    this.handlers.set(type, handler)
  }

  /** Enqueue a job (idempotent on input_hash) and nudge the lanes. */
  enqueue(input: Parameters<Repo['enqueueJob']>[0]): Job {
    const job = this.repo.enqueueJob(input)
    this.onChanged()
    if (this.running) void this.tick()
    return job
  }

  /** Begin live polling. Safe to call once. */
  start(): void {
    if (this.running) return
    this.running = true
    this.timer = setInterval(() => void this.tick(), this.pollMs)
    void this.tick()
  }

  stop(): void {
    this.running = false
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Process every queued job to completion, then resolve. Used by tests/CLI. */
  async drain(): Promise<void> {
    // Process lanes until neither can claim more work.
    for (;;) {
      const did = await Promise.all(LANES.map((lane) => this.processOne(lane)))
      if (!did.some(Boolean)) break
    }
  }

  private async tick(): Promise<void> {
    if (!this.running) return
    await Promise.all(LANES.map((lane) => this.maybeProcess(lane)))
  }

  private async maybeProcess(lane: WorkerClass): Promise<void> {
    if (this.laneBusy[lane]) return
    this.laneBusy[lane] = true
    try {
      // Drain this lane one job at a time before yielding the slot.
      while (await this.processOne(lane)) {
        /* keep going */
      }
    } finally {
      this.laneBusy[lane] = false
    }
  }

  /** Claim and run a single job on the lane. Returns true if one ran. */
  private async processOne(lane: WorkerClass): Promise<boolean> {
    const job = this.repo.claimNextJob(lane)
    if (!job) return false

    const handler = this.handlers.get(job.type)
    this.onChanged()

    if (!handler) {
      this.repo.finishJob(job.id, 'failed', `no handler for job type '${job.type}'`)
      log.error('queue.no_handler', { jobId: job.id, type: job.type })
      this.onChanged()
      return true
    }

    try {
      await handler({
        job,
        repo: this.repo,
        setProgress: (p) => {
          this.repo.setJobProgress(job.id, p)
          this.onChanged()
        },
      })
      this.repo.finishJob(job.id, 'done')
      log.info('queue.done', { jobId: job.id, type: job.type })
    } catch (e) {
      const msg = errorMessage(e)
      if (job.attempts < this.maxAttempts) {
        // Requeue for another attempt (attempts already incremented on claim).
        this.repo.requeueJob(job.id, `retry (attempt ${job.attempts}): ${msg}`)
        log.warn('queue.retry', { jobId: job.id, attempt: job.attempts, error: msg })
      } else {
        this.repo.finishJob(job.id, 'failed', msg)
        log.error('queue.failed', { jobId: job.id, type: job.type, error: msg })
      }
    }
    this.onChanged()
    return true
  }
}
