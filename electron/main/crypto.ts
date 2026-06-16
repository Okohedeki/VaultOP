// Envelope encryption for vault blobs.
//
// A single 32-byte master key (held by the OS keychain via Electron safeStorage,
// or injected for tests) never touches a blob directly. Each blob gets a fresh
// random data-encryption key (DEK); the DEK is wrapped by the master key and
// stored in the blob header. AES-256-GCM (node:crypto — a vetted primitive, not
// hand-rolled) provides confidentiality + integrity. Ciphertext is all that lands
// on disk at rest.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const KEY_LEN = 32
const NONCE_LEN = 12
const TAG_LEN = 16
const DEK_AAD = Buffer.from('vaultop:dek')

export interface WrappedDek {
  nonce: Buffer
  ciphertext: Buffer // wrapped 32-byte DEK
  tag: Buffer
}

export class VaultCrypto {
  private readonly masterKey: Buffer

  constructor(masterKey: Buffer) {
    if (masterKey.length !== KEY_LEN) {
      throw new Error(`master key must be ${KEY_LEN} bytes, got ${masterKey.length}`)
    }
    this.masterKey = masterKey
  }

  /** Generate a fresh per-blob data-encryption key. */
  newDek(): Buffer {
    return randomBytes(KEY_LEN)
  }

  /** Wrap a DEK with the master key (envelope). */
  wrapDek(dek: Buffer): WrappedDek {
    const nonce = randomBytes(NONCE_LEN)
    const cipher = createCipheriv(ALGO, this.masterKey, nonce)
    cipher.setAAD(DEK_AAD)
    const ciphertext = Buffer.concat([cipher.update(dek), cipher.final()])
    return { nonce, ciphertext, tag: cipher.getAuthTag() }
  }

  /** Unwrap a DEK; throws if the master key is wrong or data is tampered. */
  unwrapDek(w: WrappedDek): Buffer {
    const decipher = createDecipheriv(ALGO, this.masterKey, w.nonce)
    decipher.setAAD(DEK_AAD)
    decipher.setAuthTag(w.tag)
    return Buffer.concat([decipher.update(w.ciphertext), decipher.final()])
  }
}

export const CRYPTO_CONSTS = { ALGO, KEY_LEN, NONCE_LEN, TAG_LEN } as const
