// Headless self-test that runs INSIDE the real Electron runtime (not plain Node),
// so it proves the packaged app's native modules (better-sqlite3 built for Electron's
// ABI) and the whole ingest→encrypt→transcode→analyze→assemble→gate pipeline actually
// load and work. Invoked via `VaultOP --selftest`; exits 0 on pass, 1 on fail.

import { randomBytes } from 'node:crypto'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createVaultContext } from './context'
import { FFMPEG_BIN, ffprobe } from './ffmpeg'
import { log } from './log'

export async function runSelfTest(schemaSql: string): Promise<boolean> {
  const work = mkdtempSync(join(tmpdir(), 'vaultop-selftest-'))
  const sample = join(work, 'sample.mp4')
  const gen = spawnSync(
    FFMPEG_BIN,
    [
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=15',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
      '-shortest', '-pix_fmt', 'yuv420p', sample,
    ],
    { encoding: 'utf8' },
  )
  if (gen.status !== 0) {
    log.error('selftest.ffmpeg_failed', { stderr: gen.stderr?.slice(-300) })
    return false
  }

  const ctx = createVaultContext({
    baseDir: join(work, 'vault'),
    masterKey: randomBytes(32),
    schemaSql,
    autostart: false,
  })

  try {
    const added = await ctx.ingest.addFiles([sample])
    const assetId = added.added[0]?.assetId
    if (!assetId) throw new Error('ingest added nothing')
    await ctx.queue.drain()

    const asset = ctx.repo.getAsset(assetId)
    if (asset?.status !== 'ready') throw new Error(`asset status ${asset?.status}`)
    const segs = ctx.repo.listSegmentsByAsset(assetId)
    if (segs.length < 1 || !segs[0]!.hasThumbnail) throw new Error('no analyzed segments')

    // Teaser + gate.
    const teaser = ctx.createTeaser(assetId)
    await ctx.queue.drain()
    ctx.setReviewMasks(teaser.variantId, [{ x: 0.3, y: 0.5, w: 0.4, h: 0.3 }])
    await ctx.approveReview(teaser.variantId)
    const out = join(work, 'teaser.mp4')
    await ctx.exportVariant(teaser.variantId, out)
    const probe = await ffprobe(out)
    if (!existsSync(out) || probe.width !== 1080) throw new Error('teaser export failed')

    log.info('selftest.pass', {
      segments: segs.length,
      teaser: `${probe.width}x${probe.height}`,
    })
    // eslint-disable-next-line no-console
    console.log('✅ VaultOP selftest PASSED (Electron runtime + native modules OK)')
    return true
  } catch (e) {
    log.error('selftest.fail', { error: e instanceof Error ? e.message : String(e) })
    // eslint-disable-next-line no-console
    console.error('❌ VaultOP selftest FAILED:', e)
    return false
  } finally {
    ctx.close()
  }
}
