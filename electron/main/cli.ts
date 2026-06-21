// Headless CLI for VaultOP — `VaultOP --cli <command> [args]`.
//
// Runs against the SAME vault the GUI uses (same userData dir + OS-keychain master
// key), so agents and the user can script the whole pipeline and the desktop app
// sees the results. Every command prints a single JSON object to stdout:
//   { "ok": true, ... }  or  { "ok": false, "error": "..." }
// Exit code is 0 on ok, 1 on error — easy for agents to branch on.

import { join } from 'node:path'
import { createVaultContext, type VaultContext } from './context'
import { loadOrCreateMasterKey } from './masterkey'
import type { Aspect, MaskRegion } from '@shared/domain'

const out = (obj: unknown): void => {
  process.stdout.write(JSON.stringify(obj) + '\n')
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
async function pollUntil<T>(fn: () => T | null, ok: (v: T) => boolean, timeoutMs: number): Promise<T | null> {
  const end = Date.now() + timeoutMs
  for (;;) {
    const v = fn()
    if (v && ok(v)) return v
    if (Date.now() > end) return v
    await wait(400)
  }
}

interface Parsed {
  cmd: string
  positionals: string[]
  flags: Record<string, string | boolean>
}

function parseArgs(argv: string[]): Parsed {
  const [cmd = 'help', ...rest] = argv
  const positionals: string[] = []
  const flags: Record<string, string | boolean> = {}
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = rest[i + 1]
      if (next && !next.startsWith('--')) {
        flags[key] = next
        i++
      } else flags[key] = true
    } else positionals.push(a)
  }
  return { cmd, positionals, flags }
}

const HELP = {
  ok: true,
  usage: 'VaultOP --cli <command> [args] [--flags]',
  commands: {
    status: 'vault summary (asset/segment/variant/job counts)',
    'ingest <file...> [--no-wait]': 'add footage; waits until analyzed by default',
    assets: 'list assets',
    'segments <assetId>': 'list an asset’s segments',
    'search <query...>': 'text search across tags + transcripts',
    'similar <segmentId>': 'visual-similarity search',
    'sections <assetId>': 'list a clip’s Sections (seeded from Scenes on first call)',
    'section-new <assetId> <startMs> <endMs> [--label x]': 'create a Section on the clip',
    'section-tag <sectionId> <value>': 'add a tag to a Section',
    'section-untag <sectionId> <value>': 'remove a tag from a Section',
    'by-tag <value> [--asset assetId]': 'find Sections by tag (whole library, or one clip)',
    'cut <sectionId,sectionId,...> [--aspect vertical|square|widescreen] [--captions] [--no-wait]':
      'render a Cut from Sections (the Builder, headless)',
    'promos <cutVariantId> <tiktok,feed,reels,youtube,reddit> [--no-wait]':
      'turn a Cut into platform-bound Promos (each enters the blur gate)',
    'teaser <assetId> [--no-wait]': 'render a 30s vertical teaser (enters review gate)',
    'compile <segId,segId,...> [--aspect widescreen|vertical|square] [--no-wait]': 'stitch a compilation',
    'fanout <assetId> [--no-wait]': 'one master → the full set (vertical+square teasers, GIF, paid)',
    'watermark <variantId> <fanLabel> <dest.mp4>': 'export an approved cut with a per-fan forensic watermark',
    'review <variantId>': 'show review state + masks',
    'mask <variantId> <x,y,w,h> [more...]': 'set blur masks (normalized 0..1)',
    'approve <variantId>': 're-blur with masks + approve (unlocks export)',
    'reject <variantId>': 'reject the review',
    'export <variantId> <dest.mp4>': 'export an approved/unrestricted variant',
    variants: 'list deliverables',
    jobs: 'list recent jobs',
  },
}

export async function runCli(
  argv: string[],
  env: { userData: string; schemaSql: string },
): Promise<number> {
  const { cmd, positionals, flags } = parseArgs(argv)
  if (cmd === 'help' || flags.help) {
    out(HELP)
    return 0
  }

  let ctx: VaultContext | null = null
  try {
    const masterKey = loadOrCreateMasterKey(env.userData)
    ctx = createVaultContext({
      baseDir: join(env.userData, 'vault'),
      masterKey,
      schemaSql: env.schemaSql,
      autostart: true, // run the queue so enqueued work actually processes
    })
    const c = ctx
    const wantWait = flags['no-wait'] !== true

    switch (cmd) {
      case 'status': {
        const jobs = c.repo.listJobs(false)
        out({
          ok: true,
          assets: c.repo.listAssets().length,
          variants: c.repo.listVariants().length,
          jobs: {
            queued: jobs.filter((j) => j.state === 'queued').length,
            running: jobs.filter((j) => j.state === 'running').length,
            failed: jobs.filter((j) => j.state === 'failed').length,
          },
        })
        return 0
      }
      case 'ingest': {
        if (positionals.length === 0) throw new Error('ingest needs at least one file path')
        const res = await c.ingest.addFiles(positionals)
        if (wantWait) {
          for (const a of res.added) {
            await pollUntil(() => c.repo.getAsset(a.assetId), (x) => x.status === 'ready' || x.status === 'failed', 600_000)
          }
        }
        out({
          ok: true,
          added: res.added.map((a) => ({ ...a, status: c.repo.getAsset(a.assetId)?.status })),
          duplicates: res.duplicates,
        })
        return 0
      }
      case 'assets':
        out({ ok: true, assets: c.repo.listAssets() })
        return 0
      case 'segments': {
        const [assetId] = positionals
        if (!assetId) throw new Error('segments needs an assetId')
        out({ ok: true, segments: c.repo.listSegmentsByAsset(assetId) })
        return 0
      }
      case 'search':
        out({ ok: true, hits: c.repo.searchSegments(positionals.join(' ')) })
        return 0
      case 'similar': {
        const [segmentId] = positionals
        if (!segmentId) throw new Error('similar needs a segmentId')
        out({ ok: true, hits: c.repo.similarSegments(segmentId) })
        return 0
      }
      case 'sections': {
        const [assetId] = positionals
        if (!assetId) throw new Error('sections needs an assetId')
        const master = c.repo.getMasterByAsset(assetId)
        if (!master) throw new Error('asset has no master yet (still processing?)')
        c.repo.ensureSectionsForMaster(master.id)
        out({ ok: true, masterId: master.id, sections: c.repo.listSectionsByMaster(master.id) })
        return 0
      }
      case 'section-new': {
        const [assetId, startMs, endMs] = positionals
        if (!assetId || startMs === undefined || endMs === undefined) {
          throw new Error('section-new needs <assetId> <startMs> <endMs>')
        }
        const master = c.repo.getMasterByAsset(assetId)
        if (!master) throw new Error('asset has no master yet')
        const s = c.repo.createSection({
          masterId: master.id,
          startMs: Number(startMs),
          endMs: Number(endMs),
          label: typeof flags.label === 'string' ? flags.label : null,
        })
        out({ ok: true, section: s })
        return 0
      }
      case 'section-tag': {
        const [sectionId, value] = positionals
        if (!sectionId || !value) throw new Error('section-tag needs <sectionId> <value>')
        c.repo.addSectionTag(sectionId, value)
        out({ ok: true, section: c.repo.getSection(sectionId) })
        return 0
      }
      case 'section-untag': {
        const [sectionId, value] = positionals
        if (!sectionId || !value) throw new Error('section-untag needs <sectionId> <value>')
        c.repo.removeSectionTag(sectionId, value)
        out({ ok: true, section: c.repo.getSection(sectionId) })
        return 0
      }
      case 'by-tag': {
        const [value] = positionals
        if (!value) throw new Error('by-tag needs a tag value')
        let masterId: string | null = null
        if (typeof flags.asset === 'string') {
          const m = c.repo.getMasterByAsset(flags.asset)
          if (!m) throw new Error('asset has no master yet')
          masterId = m.id
        }
        out({ ok: true, sections: c.repo.sectionsByTag(value, masterId) })
        return 0
      }
      case 'cut': {
        const ids = (positionals[0] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
        if (ids.length === 0) throw new Error('cut needs comma-separated section ids')
        const clips = ids.map((id) => {
          const s = c.repo.getSection(id)
          if (!s) throw new Error(`section ${id} not found`)
          return {
            sectionId: s.id,
            masterId: s.masterId,
            startMs: s.startMs,
            endMs: s.endMs,
            speed: 1,
            label: s.label,
          }
        })
        const aspect = (flags.aspect as Aspect) || 'vertical'
        const { variantId } = c.createCut({
          aspect,
          captions: flags.captions === true,
          overlays: [],
          clips,
        })
        if (wantWait) {
          await pollUntil(() => c.repo.getVariant(variantId), (v) => v.renderState === 'ready' || v.renderState === 'failed', 600_000)
        }
        out({ ok: true, variant: c.repo.getVariant(variantId) })
        return 0
      }
      case 'promos': {
        const [cutVariantId, platformList] = positionals
        if (!cutVariantId || !platformList) {
          throw new Error('promos needs <cutVariantId> <comma,platforms>')
        }
        const platforms = platformList.split(',').map((s) => s.trim()).filter(Boolean)
        const { variantIds } = c.makePromos(cutVariantId, platforms)
        if (wantWait) {
          for (const id of variantIds) {
            await pollUntil(() => c.repo.getVariant(id), (v) => v.renderState === 'ready' || v.renderState === 'failed', 600_000)
          }
        }
        out({ ok: true, variants: variantIds.map((id) => c.repo.getVariant(id)) })
        return 0
      }
      case 'teaser': {
        const [assetId] = positionals
        if (!assetId) throw new Error('teaser needs an assetId')
        const { variantId } = c.createTeaser(assetId)
        if (wantWait) {
          await pollUntil(() => c.repo.getVariant(variantId), (v) => v.renderState === 'ready' || v.renderState === 'failed', 600_000)
        }
        out({ ok: true, variant: c.repo.getVariant(variantId) })
        return 0
      }
      case 'compile': {
        const ids = (positionals[0] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
        if (ids.length === 0) throw new Error('compile needs comma-separated segment ids')
        const aspect = (flags.aspect as Aspect) || 'widescreen'
        const { variantId } = c.createCompilation(ids, aspect)
        if (wantWait) {
          await pollUntil(() => c.repo.getVariant(variantId), (v) => v.renderState === 'ready' || v.renderState === 'failed', 600_000)
        }
        out({ ok: true, variant: c.repo.getVariant(variantId) })
        return 0
      }
      case 'fanout': {
        const [assetId] = positionals
        if (!assetId) throw new Error('fanout needs an assetId')
        const { variantIds } = c.createFanout(assetId)
        if (wantWait) {
          for (const id of variantIds) {
            await pollUntil(() => c.repo.getVariant(id), (v) => v.renderState === 'ready' || v.renderState === 'failed', 600_000)
          }
        }
        out({ ok: true, variants: variantIds.map((id) => c.repo.getVariant(id)) })
        return 0
      }
      case 'watermark': {
        const [variantId, fanLabel, dest] = positionals
        if (!variantId || !fanLabel || !dest) {
          throw new Error('watermark needs <variantId> <fanLabel> <dest.mp4>')
        }
        await c.exportWatermarked(variantId, fanLabel, dest)
        out({ ok: true, path: dest, fan: fanLabel })
        return 0
      }
      case 'review': {
        const [variantId] = positionals
        if (!variantId) throw new Error('review needs a variantId')
        out({ ok: true, review: c.getReview(variantId), variant: c.repo.getVariant(variantId) })
        return 0
      }
      case 'mask': {
        const [variantId, ...boxes] = positionals
        if (!variantId || boxes.length === 0) throw new Error('mask needs <variantId> <x,y,w,h> ...')
        const masks: MaskRegion[] = boxes.map((b) => {
          const [x, y, w, h] = b.split(',').map(Number)
          if ([x, y, w, h].some((n) => Number.isNaN(n))) throw new Error(`bad box "${b}"`)
          return { x: x!, y: y!, w: w!, h: h! }
        })
        c.setReviewMasks(variantId, masks)
        out({ ok: true, masks })
        return 0
      }
      case 'approve': {
        const [variantId] = positionals
        if (!variantId) throw new Error('approve needs a variantId')
        await c.approveReview(variantId)
        out({ ok: true, variant: c.repo.getVariant(variantId) })
        return 0
      }
      case 'reject': {
        const [variantId] = positionals
        if (!variantId) throw new Error('reject needs a variantId')
        c.rejectReview(variantId)
        out({ ok: true, variant: c.repo.getVariant(variantId) })
        return 0
      }
      case 'export': {
        const [variantId, dest] = positionals
        if (!variantId || !dest) throw new Error('export needs <variantId> <dest.mp4>')
        await c.exportVariant(variantId, dest)
        out({ ok: true, path: dest })
        return 0
      }
      case 'variants':
        out({ ok: true, variants: c.repo.listVariants() })
        return 0
      case 'jobs':
        out({ ok: true, jobs: c.repo.listJobs(false) })
        return 0
      default:
        out({ ok: false, error: `unknown command "${cmd}"`, hint: 'run: VaultOP --cli help' })
        return 1
    }
  } catch (e) {
    out({ ok: false, error: e instanceof Error ? e.message : String(e) })
    return 1
  } finally {
    ctx?.close()
  }
}
