import { createHash, randomBytes } from 'node:crypto'
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ModelStore } from '../electron/main/models'

function fixture(): { url: string; sha256: string; bytes: Buffer } {
  const dir = mkdtempSync(join(tmpdir(), 'vop-fx-'))
  const bytes = randomBytes(20_000)
  const p = join(dir, 'model.bin')
  writeFileSync(p, bytes)
  return { url: pathToFileURL(p).href, sha256: createHash('sha256').update(bytes).digest('hex'), bytes }
}

describe('ModelStore', () => {
  it('downloads + caches a model and reports progress', async () => {
    const store = new ModelStore(mkdtempSync(join(tmpdir(), 'vop-models-')))
    const fx = fixture()
    let last = 0
    const path = await store.ensure({ name: 'm.bin', url: fx.url, sha256: fx.sha256 }, (f) => (last = f))
    expect(existsSync(path)).toBe(true)
    expect(last).toBe(1)
    expect(store.has('m.bin')).toBe(true)
  })

  it('serves from cache without re-downloading (bad url, still resolves)', async () => {
    const store = new ModelStore(mkdtempSync(join(tmpdir(), 'vop-models2-')))
    const fx = fixture()
    await store.ensure({ name: 'm.bin', url: fx.url, sha256: fx.sha256 })
    // Cache hit: even a broken URL must not be fetched.
    const path = await store.ensure({ name: 'm.bin', url: 'file:///does/not/exist', sha256: fx.sha256 })
    expect(existsSync(path)).toBe(true)
  })

  it('rejects a checksum mismatch and leaves no partial file', async () => {
    const store = new ModelStore(mkdtempSync(join(tmpdir(), 'vop-models3-')))
    const fx = fixture()
    await expect(
      store.ensure({ name: 'bad.bin', url: fx.url, sha256: 'deadbeef'.repeat(8) }),
    ).rejects.toThrow(/checksum mismatch/)
    expect(store.has('bad.bin')).toBe(false)
  })
})
