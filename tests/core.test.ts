import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDb } from '../electron/main/db'
import { Repo } from '../electron/main/repo'
import { VaultCrypto } from '../electron/main/crypto'
import { BlobStore } from '../electron/main/blobstore'
import { resolveVaultPaths } from '../electron/main/paths'

function freshRepo(): Repo {
  const dir = mkdtempSync(join(tmpdir(), 'vop-db-'))
  const schema = readFileSync(join(process.cwd(), 'db', 'schema.sql'), 'utf8')
  return new Repo(openDb(join(dir, 'v.db'), schema))
}

describe('asset status state machine', () => {
  it('allows legal transitions and rejects illegal ones', () => {
    const repo = freshRepo()
    const a = repo.createAsset({ contentHash: 'h1', originalFilename: 'x.mov', bytes: 10 })
    expect(a.status).toBe('uploaded')

    repo.setAssetStatus(a.id, 'transcoding')
    repo.setAssetStatus(a.id, 'ready')
    expect(repo.getAsset(a.id)!.status).toBe('ready')

    // ready is terminal — any forward jump must throw.
    expect(() => repo.setAssetStatus(a.id, 'transcoding')).toThrow(/illegal asset transition/)
  })

  it('rejects skipping straight from uploaded to ready', () => {
    const repo = freshRepo()
    const a = repo.createAsset({ contentHash: 'h2', originalFilename: 'y.mov', bytes: 10 })
    expect(() => repo.setAssetStatus(a.id, 'ready')).toThrow(/illegal asset transition/)
  })
})

describe('job idempotency', () => {
  it('dedupes jobs by input_hash', () => {
    const repo = freshRepo()
    const a = repo.createAsset({ contentHash: 'h3', originalFilename: 'z.mov', bytes: 10 })
    const j1 = repo.enqueueJob({
      type: 'transcode',
      targetType: 'asset',
      targetId: a.id,
      workerClass: 'cpu',
      inputHash: 'same-hash',
    })
    const j2 = repo.enqueueJob({
      type: 'transcode',
      targetType: 'asset',
      targetId: a.id,
      workerClass: 'cpu',
      inputHash: 'same-hash',
    })
    expect(j2.id).toBe(j1.id)
    expect(repo.listJobs().length).toBe(1)
  })
})

describe('blob store encryption', () => {
  it('round-trips a file and dedupes by content hash', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vop-blob-'))
    const paths = resolveVaultPaths(dir)
    const store = new BlobStore(new VaultCrypto(randomBytes(32)), paths)

    const src = join(dir, 'src.bin')
    const payload = randomBytes(50_000)
    writeFileSync(src, payload)

    const info = await store.putFile(src)
    expect(info.bytes).toBe(payload.length)
    // On disk the blob must NOT equal the plaintext (it's ciphertext).
    const onDisk = readFileSync(join(paths.blobsDir, info.hash))
    expect(onDisk.equals(payload)).toBe(false)

    const out = join(dir, 'out.bin')
    await store.getToFile(info.hash, out)
    expect(readFileSync(out).equals(payload)).toBe(true)

    // Re-put identical content → same hash, deduped.
    const info2 = await store.putFile(src)
    expect(info2.hash).toBe(info.hash)
  })

  it('rejects a wrong master key (tamper/auth failure)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vop-blob2-'))
    const paths = resolveVaultPaths(dir)
    const real = new BlobStore(new VaultCrypto(randomBytes(32)), paths)
    const src = join(dir, 's.bin')
    writeFileSync(src, randomBytes(1024))
    const info = await real.putFile(src)

    const wrong = new BlobStore(new VaultCrypto(randomBytes(32)), paths)
    await expect(wrong.getToFile(info.hash, join(dir, 'o.bin'))).rejects.toThrow()
  })
})
