// Headless end-to-end smoke for Phase 0: generates a tiny clip, ingests it through
// the real vault context (encrypt → transcode → master → ready), and asserts the
// spine works without launching the GUI. Run: npm run smoke
//
// Uses a fresh test master key (the GUI uses the OS keychain instead).

import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createVaultContext } from '../electron/main/context'
import { FFMPEG_BIN, ffprobe } from '../electron/main/ffmpeg'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
}

async function main(): Promise<void> {
  const work = mkdtempSync(join(tmpdir(), 'vaultop-smoke-'))
  const baseDir = join(work, 'vault')
  const sample = join(work, 'sample.mp4')

  // 1. Generate a 2s test clip with the bundled ffmpeg.
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
  assert(gen.status === 0, `ffmpeg sample generation failed: ${gen.stderr?.slice(-300)}`)
  assert(existsSync(sample), 'sample clip not created')
  console.log('· generated test clip')

  // 2. Build a vault context (test key, no live polling — we drain manually).
  const schemaSql = readFileSync(join(process.cwd(), 'db', 'schema.sql'), 'utf8')
  const ctx = createVaultContext({
    baseDir,
    masterKey: randomBytes(32),
    schemaSql,
    autostart: false,
  })

  try {
    // 3. Ingest + process to completion.
    const res = await ctx.ingest.addFiles([sample])
    assert(res.added.length === 1, 'expected exactly one asset added')
    const assetId = res.added[0]!.assetId
    await ctx.queue.drain()

    // 4. Assert the spine.
    const asset = ctx.repo.getAsset(assetId)
    assert(asset, 'asset missing')
    assert(asset.status === 'ready', `asset status is '${asset.status}', expected ready`)
    assert(existsSync(join(ctx.paths.blobsDir, asset.contentHash)), 'encrypted original blob missing')
    console.log(`· asset ready (${asset.contentHash.slice(0, 12)})`)

    const master = ctx.repo.getMasterByAsset(assetId)
    assert(master, 'master missing')
    assert(master.durationMs > 1000, 'master duration looks wrong')
    assert(master.width === 320 && master.height === 240, 'master dimensions wrong')
    const masterHash = master.storageUri.replace('blobs/', '')
    assert(existsSync(join(ctx.paths.blobsDir, masterHash)), 'encrypted master blob missing')
    console.log(`· master created (${master.width}x${master.height}, ${master.durationMs}ms, h264)`)

    // 4b. Phase 1: scene-split segments + encrypted thumbnails.
    const segments = ctx.repo.listSegmentsByAsset(assetId)
    assert(segments.length >= 1, 'expected at least one segment')
    assert(
      segments.every((s) => s.hasThumbnail),
      'every segment should have a thumbnail',
    )
    assert(segments[0]!.startMs === 0, 'first segment should start at 0')
    const dataUrl = await ctx.readThumbnailDataUrl(segments[0]!.id)
    assert(dataUrl?.startsWith('data:image/jpeg;base64,'), 'thumbnail not decryptable to data URL')
    console.log(`· ${segments.length} segment(s) split, thumbnails encrypted + decryptable`)

    // 4c. Phase 2: native analysis → tags, embeddings, search, similarity.
    const tags = ctx.repo.getSegmentTags(segments[0]!.id)
    assert(
      tags.some((t) => t.key === 'length'),
      'expected a length tag from the native analyzer',
    )
    assert(
      tags.some((t) => t.key === 'lighting'),
      'expected a lighting tag from the native analyzer',
    )
    const textHits = ctx.repo.searchSegments('short')
    assert(textHits.length >= 1, 'text search for "short" should match the 2s clip')
    console.log(`· tags written (${tags.map((t) => `${t.key}=${t.value}`).join(', ')}); search works`)

    // Second, visually-distinct clip → exercises embedding + similarity search.
    const sample2 = join(work, 'bars.mp4')
    const gen2 = spawnSync(
      FFMPEG_BIN,
      ['-y', '-f', 'lavfi', '-i', 'smptebars=duration=2:size=320x240:rate=15', '-pix_fmt', 'yuv420p', sample2],
      { encoding: 'utf8' },
    )
    assert(gen2.status === 0, 'second clip generation failed')
    const add2 = await ctx.ingest.addFiles([sample2])
    await ctx.queue.drain()
    const seg2 = ctx.repo.listSegmentsByAsset(add2.added[0]!.assetId)
    const similar = ctx.repo.similarSegments(seg2[0]!.id)
    assert(similar.length >= 1, 'similarity search should return the other clip')
    assert(similar[0]!.score != null, 'similarity hit should carry a cosine score')
    console.log(`· embeddings stored; visual similarity returns ${similar.length} hit(s)`)

    // 4d. Phase 3: assembly — teaser (vertical) + compilation (widescreen).
    const teaser = ctx.createTeaser(assetId)
    await ctx.queue.drain()
    const tv = ctx.repo.getVariant(teaser.variantId)
    assert(tv?.renderState === 'ready', `teaser render state is '${tv?.renderState}'`)
    assert(tv.requiresReview && tv.reviewState === 'pending', 'teaser must be gated for review')
    assert(tv.durationMs != null && tv.durationMs <= 30_000, 'teaser should be ≤30s')
    console.log(`· teaser rendered (${tv.durationMs}ms), gated pending review`)

    // 4e. Phase 4: the mandatory blur gate.
    let blocked = false
    try {
      await ctx.exportVariant(teaser.variantId, join(work, 'nope.mp4'))
    } catch {
      blocked = true
    }
    assert(blocked, 'export must be blocked until the teaser is approved')

    const review = ctx.getReview(teaser.variantId)
    assert(review?.verdict === 'pending', 'review should start pending')
    assert(review.detectorAvailable === false, 'no detector model bundled in this build')

    // Human draws a mask, then approves → re-blurs and unlocks export.
    ctx.setReviewMasks(teaser.variantId, [{ x: 0.3, y: 0.5, w: 0.4, h: 0.3 }])
    await ctx.approveReview(teaser.variantId)
    assert(ctx.repo.getVariant(teaser.variantId)?.reviewState === 'approved', 'should be approved')

    const teaserOut = join(work, 'teaser.mp4')
    await ctx.exportVariant(teaser.variantId, teaserOut)
    const tp = await ffprobe(teaserOut)
    assert(tp.width === 1080 && tp.height === 1920, `teaser dims ${tp.width}x${tp.height}, want 1080x1920`)
    console.log(`· blur gate: export blocked pre-approval; mask→approve→export ${tp.width}x${tp.height} ✓`)

    const allSegments = [...ctx.repo.listSegmentsByAsset(assetId), ...seg2].map((s) => s.id)
    const comp = ctx.createCompilation(allSegments, 'widescreen')
    await ctx.queue.drain()
    const cv = ctx.repo.getVariant(comp.variantId)
    assert(cv?.renderState === 'ready', `compilation render state is '${cv?.renderState}'`)
    const compOut = join(work, 'comp.mp4')
    await ctx.exportVariant(comp.variantId, compOut)
    const cp = await ffprobe(compOut)
    assert(cp.width === 1920 && cp.height === 1080, `comp dims ${cp.width}x${cp.height}, want 1920x1080`)
    assert(cp.durationMs > 1000, 'compilation should stitch both clips')
    console.log(`· compilation rendered ${cp.width}x${cp.height}, ${cv.durationMs}ms across 2 sources`)

    // 5. Re-ingest the identical file → content-hash dedup, no new asset.
    const again = await ctx.ingest.addFiles([sample])
    assert(again.added.length === 0, 'duplicate ingest should add nothing')
    assert(again.duplicates.length === 1, 'duplicate ingest should report one duplicate')
    assert(ctx.repo.listAssets().length === 2, 'dedup failed — unexpected asset count')
    console.log('· dedup verified (same content hash, no re-transcode)')

    // 6. No plaintext left behind in tmp.
    const { readdirSync } = await import('node:fs')
    const leftovers = readdirSync(ctx.paths.tmpDir).filter(
      (f) => f.endsWith('.in') || f.endsWith('.master.mp4') || f.endsWith('.jpg'),
    )
    assert(leftovers.length === 0, `plaintext leftovers in tmp: ${leftovers.join(', ')}`)
    console.log('· tmp plaintext wiped')

    console.log('\n✅ Phase 0 smoke PASSED')
  } finally {
    ctx.close()
  }
}

main().catch((e) => {
  console.error('\n❌ Phase 0 smoke FAILED')
  console.error(e)
  process.exit(1)
})
