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
process.env.VAULTOP_NO_ML = '1' // keep the smoke offline + fast (ML verified separately)
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

    // 4e-bis. Editor (E1/E2): seed Sections, tag one, then build a Cut from an EDL
    // with a per-clip speed change — the Builder's core output path.
    ctx.repo.ensureSectionsForMaster(master.id)
    const secs = ctx.repo.listSectionsByMaster(master.id)
    assert(secs.length >= 1, 'sections should seed from scenes')
    ctx.repo.addSectionTag(secs[0]!.id, 'Reveal')
    assert(
      ctx.repo.sectionsByTag('reveal', master.id).length === 1,
      'tag filter should find the tagged section (case-insensitive)',
    )
    const cut = ctx.createCut({
      aspect: 'square',
      captions: false,
      overlays: [],
      clips: [
        { sectionId: null, masterId: master.id, startMs: 0, endMs: 1000, speed: 1 },
        { sectionId: null, masterId: master.id, startMs: 1000, endMs: 2000, speed: 2 },
      ],
    })
    await ctx.queue.drain()
    const cutV = ctx.repo.getVariant(cut.variantId)
    assert(cutV?.renderState === 'ready', `cut render state is '${cutV?.renderState}'`)
    assert(cutV.type === 'cut' && !cutV.requiresReview, 'a Cut must not be platform-gated (ADR-001)')
    const cutOut = join(work, 'cut.mp4')
    await ctx.exportVariant(cut.variantId, cutOut) // no gate → exports directly
    const cpr = await ffprobe(cutOut)
    assert(cpr.width === 1080 && cpr.height === 1080, `cut dims ${cpr.width}x${cpr.height}, want 1080x1080`)
    // clip1 (1000ms @1×) + clip2 (1000ms @2× → ~500ms) ≈ 1500ms.
    assert(
      cpr.durationMs > 1100 && cpr.durationMs < 2000,
      `cut duration ${cpr.durationMs}ms outside expected ~1500ms (speed change not applied?)`,
    )
    console.log(
      `· editor Cut: EDL (2 clips, one at 2× speed) rendered ${cpr.width}x${cpr.height}, ${cutV.durationMs}ms ✓`,
    )

    // 4e-ter. Captions (E3): seed a timestamped transcript, render a captioned Cut →
    // maps transcript onto the EDL timeline and burns an SRT (no ML needed here).
    ctx.repo.setTranscriptChunks(master.id, [
      { startMs: 0, endMs: 800, text: 'hello there' },
      { startMs: 800, endMs: 1600, text: 'welcome to the show' },
    ])
    assert(ctx.repo.getTranscriptChunks(master.id).length === 2, 'transcript chunks should persist')
    const capCut = ctx.createCut({
      aspect: 'vertical',
      captions: true,
      // …and a manual text overlay → exercises the libass title burn alongside captions.
      overlays: [{ text: 'GET 50% OFF', startMs: 0, endMs: 1200, position: 'top' }],
      clips: [{ sectionId: null, masterId: master.id, startMs: 0, endMs: 1600, speed: 1 }],
    })
    await ctx.queue.drain()
    const capV = ctx.repo.getVariant(capCut.variantId)
    assert(capV?.renderState === 'ready', `captioned cut render state '${capV?.renderState}'`)
    const capOut = join(work, 'cap.mp4')
    await ctx.exportVariant(capCut.variantId, capOut)
    const capr = await ffprobe(capOut)
    assert(capr.width === 1080 && capr.height === 1920, `captioned cut dims ${capr.width}x${capr.height}`)
    console.log(
      `· captions + text overlay: SRT + ASS title burned into Cut ${capr.width}x${capr.height} ✓`,
    )

    // 4e-quater. Promos (E4): turn the Cut into platform-bound Promos → reframed,
    // capped, and gated. The Cut itself had no gate; its Promos do.
    const promos = ctx.makePromos(cut.variantId, ['tiktok', 'feed'])
    assert(promos.variantIds.length === 2, 'two promos expected')
    await ctx.queue.drain()
    const pvs = promos.variantIds.map((id) => ctx.repo.getVariant(id)!)
    assert(pvs.every((v) => v.renderState === 'ready'), 'promos should render')
    assert(
      pvs.every((v) => v.type === 'promo' && v.requiresReview && v.reviewState === 'pending'),
      'every Promo must be platform-gated',
    )
    const tk = pvs.find((v) => v.aspect === 'vertical')!
    assert(pvs.some((v) => v.aspect === 'square'), 'IG feed promo should be square')
    let pblocked = false
    try {
      await ctx.exportVariant(tk.id, join(work, 'nope2.mp4'))
    } catch {
      pblocked = true
    }
    assert(pblocked, 'promo export must be blocked until approved')
    ctx.setReviewMasks(tk.id, [{ x: 0.2, y: 0.4, w: 0.3, h: 0.3 }])
    await ctx.approveReview(tk.id)
    const tkOut = join(work, 'promo-tiktok.mp4')
    await ctx.exportVariant(tk.id, tkOut)
    const tkr = await ffprobe(tkOut)
    assert(tkr.width === 1080 && tkr.height === 1920, `tiktok promo dims ${tkr.width}x${tkr.height}`)
    console.log(
      `· promos: Cut → 2 platform Promos (reframed + gated); TikTok exported ${tkr.width}x${tkr.height} after approve ✓`,
    )

    // 4f. Phase 5: variant fan-out — one master → the full set.
    const fan = ctx.createFanout(assetId)
    assert(fan.variantIds.length === 4, 'fan-out should create 4 cuts')
    await ctx.queue.drain()
    const fanCuts = fan.variantIds.map((id) => ctx.repo.getVariant(id)!)
    assert(
      fanCuts.every((v) => v.renderState === 'ready'),
      `all fan-out cuts should render (${fanCuts.map((v) => v.renderState).join(',')})`,
    )
    const gif = fanCuts.find((v) => v.type === 'gif')!
    assert(gif.requiresReview && gif.reviewState === 'pending', 'gif promo should be gated')
    const paid = fanCuts.find((v) => v.type === 'paid')!
    assert(!paid.requiresReview, 'paid cut should not need a safety check')
    const wmOut = join(work, 'fan-007.mp4')
    await ctx.exportWatermarked(paid.id, 'fan #007', wmOut)
    assert((await ffprobe(wmOut)).width > 0, 'watermarked export should be playable')
    console.log(
      `· fan-out: ${fanCuts.length} cuts (vertical+square teasers, GIF, paid) + per-fan watermark export ✓`,
    )

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
