import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDb } from '../electron/main/db'
import { Repo } from '../electron/main/repo'

function setup(): { repo: Repo; masterId: string } {
  const dir = mkdtempSync(join(tmpdir(), 'vop-sec-'))
  const schema = readFileSync(join(process.cwd(), 'db', 'schema.sql'), 'utf8')
  const repo = new Repo(openDb(join(dir, 'v.db'), schema))
  const asset = repo.createAsset({ contentHash: 'h', originalFilename: 'x.mov', bytes: 1 })
  repo.setAssetStatus(asset.id, 'transcoding')
  const master = repo.createMaster({
    assetId: asset.id,
    storageUri: 'blobs/m',
    width: 1920,
    height: 1080,
    fps: 30,
    durationMs: 9000,
    codec: 'h264',
  })
  // two auto Scenes
  repo.createSegment({ masterId: master.id, startMs: 0, endMs: 3000 })
  repo.createSegment({ masterId: master.id, startMs: 3000, endMs: 9000 })
  return { repo, masterId: master.id }
}

describe('Section model', () => {
  it('seeds Sections from Scenes, idempotently', () => {
    const { repo, masterId } = setup()
    repo.ensureSectionsForMaster(masterId)
    repo.ensureSectionsForMaster(masterId) // idempotent
    const sections = repo.listSectionsByMaster(masterId)
    expect(sections).toHaveLength(2)
    expect(sections.every((s) => s.source === 'scene')).toBe(true)
    expect(sections[0]!.startMs).toBe(0)
  })

  it('creates manual Sections, tags them, and filters by tag', () => {
    const { repo, masterId } = setup()
    repo.ensureSectionsForMaster(masterId)
    const s = repo.createSection({ masterId, startMs: 1000, endMs: 2000, label: 'reveal shot' })
    expect(s.source).toBe('manual')

    repo.addSectionTag(s.id, 'Reveal') // case-insensitive
    repo.addSectionTag(s.id, 'reveal') // dedup (UNIQUE)
    const got = repo.getSection(s.id)!
    expect(got.tags.map((t) => t.value)).toEqual(['reveal'])

    expect(repo.sectionsByTag('reveal', masterId).map((x) => x.id)).toEqual([s.id])
    expect(repo.sectionsByTag('reveal', null).map((x) => x.id)).toEqual([s.id]) // whole library
    expect(repo.sectionsByTag('nope', masterId)).toHaveLength(0)
  })

  it('updates favorite + trim, and removes tags', () => {
    const { repo, masterId } = setup()
    const s = repo.createSection({ masterId, startMs: 0, endMs: 1000 })
    const updated = repo.updateSection(s.id, { favorite: true, endMs: 1500 })!
    expect(updated.favorite).toBe(true)
    expect(updated.endMs).toBe(1500)

    repo.addSectionTag(s.id, 'intro')
    repo.removeSectionTag(s.id, 'intro')
    expect(repo.getSection(s.id)!.tags).toHaveLength(0)
  })
})
