// Content-addressed, encrypted blob store.
//
// A blob is named by the sha256 of its *plaintext* — so identical uploads dedup
// automatically. On disk it is the ciphertext envelope only:
//
//   [magic 'VOP1'][ver 1B][dekNonce 12B][dekTag 16B][dekLen 1B][wrappedDek N]
//   [fileNonce 12B][ ciphertext... ][fileTag 16B]
//
// Plaintext exists only transiently in tmp during transcode/render, then is wiped.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { VaultCrypto, CRYPTO_CONSTS } from './crypto'
import type { VaultPaths } from './paths'

const MAGIC = Buffer.from('VOP1')
const VERSION = 1
const { ALGO, NONCE_LEN, TAG_LEN } = CRYPTO_CONSTS

export interface BlobInfo {
  hash: string
  uri: string // relative, e.g. blobs/<hash>
  bytes: number // plaintext byte length
}

export class BlobStore {
  constructor(
    private readonly crypto: VaultCrypto,
    private readonly paths: VaultPaths,
  ) {}

  private absFor(hash: string): string {
    return join(this.paths.blobsDir, hash)
  }

  has(hash: string): boolean {
    return existsSync(this.absFor(hash))
  }

  /** Encrypt a source file into the store. Returns its content hash + uri. */
  async putFile(srcPath: string): Promise<BlobInfo> {
    const dek = this.crypto.newDek()
    const wrapped = this.crypto.wrapDek(dek)
    const dekBlob = wrapped.ciphertext
    const header = Buffer.concat([
      MAGIC,
      Buffer.from([VERSION]),
      wrapped.nonce,
      wrapped.tag,
      Buffer.from([dekBlob.length]),
      dekBlob,
    ])

    const fileNonce = randomBytes(NONCE_LEN)
    const cipher = createCipheriv(ALGO, dek, fileNonce)
    const hasher = createHash('sha256')

    await mkdir(this.paths.tmpDir, { recursive: true })
    const tmpPath = join(this.paths.tmpDir, `put-${randomBytes(8).toString('hex')}.blob`)
    const out = createWriteStream(tmpPath)

    let plaintextBytes = 0
    out.write(header)
    out.write(fileNonce)

    const src = createReadStream(srcPath)
    for await (const chunk of src) {
      const buf = chunk as Buffer
      plaintextBytes += buf.length
      hasher.update(buf)
      const enc = cipher.update(buf)
      if (enc.length) out.write(enc)
    }
    const finalEnc = cipher.final()
    if (finalEnc.length) out.write(finalEnc)
    out.write(cipher.getAuthTag())
    await new Promise<void>((res, rej) => out.end((err?: Error | null) => (err ? rej(err) : res())))

    const hash = hasher.digest('hex')
    const dest = this.absFor(hash)

    if (this.has(hash)) {
      await rm(tmpPath, { force: true }) // dedup: identical content already stored
    } else {
      await rename(tmpPath, dest)
    }
    return { hash, uri: `blobs/${hash}`, bytes: plaintextBytes }
  }

  /** Decrypt a small blob fully into memory (for thumbnails / previews). */
  async getBuffer(hash: string): Promise<Buffer> {
    const tmp = join(this.paths.tmpDir, `read-${randomBytes(8).toString('hex')}.tmp`)
    try {
      await this.getToFile(hash, tmp)
      const { readFile } = await import('node:fs/promises')
      return await readFile(tmp)
    } finally {
      await rm(tmp, { force: true })
    }
  }

  /** Decrypt a stored blob to a plaintext file (transient — caller must wipe). */
  async getToFile(hash: string, destPath: string): Promise<void> {
    const srcPath = this.absFor(hash)
    const { size } = await stat(srcPath)

    // Parse the fixed-prefix header to discover the wrapped-DEK length.
    const prefix = await readBytes(srcPath, 0, MAGIC.length + 1 + NONCE_LEN + TAG_LEN + 1)
    let off = 0
    if (!prefix.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('bad blob magic')
    off += MAGIC.length
    const ver = prefix[off]
    off += 1
    if (ver !== VERSION) throw new Error(`unsupported blob version ${ver}`)
    const dekNonce = prefix.subarray(off, off + NONCE_LEN)
    off += NONCE_LEN
    const dekTag = prefix.subarray(off, off + TAG_LEN)
    off += TAG_LEN
    const dekLen = prefix[off]!
    off += 1

    const wrappedDek = await readBytes(srcPath, off, dekLen)
    const headerLen = off + dekLen
    const fileNonce = await readBytes(srcPath, headerLen, NONCE_LEN)
    const ctStart = headerLen + NONCE_LEN
    const tagStart = size - TAG_LEN
    const fileTag = await readBytes(srcPath, tagStart, TAG_LEN)

    const dek = this.crypto.unwrapDek({ nonce: dekNonce, ciphertext: wrappedDek, tag: dekTag })
    const decipher = createDecipheriv(ALGO, dek, fileNonce)
    decipher.setAuthTag(fileTag)

    await mkdir(this.paths.tmpDir, { recursive: true })
    const ctStream = createReadStream(srcPath, { start: ctStart, end: tagStart - 1 })
    await pipeline(ctStream, decipher, createWriteStream(destPath))
  }
}

/** Read exactly `len` bytes from `path` at `offset`. */
async function readBytes(path: string, offset: number, len: number): Promise<Buffer> {
  if (len === 0) return Buffer.alloc(0)
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const s = createReadStream(path, { start: offset, end: offset + len - 1 })
    s.on('data', (c) => chunks.push(c as Buffer))
    s.on('end', () => resolve(Buffer.concat(chunks)))
    s.on('error', reject)
  })
}
