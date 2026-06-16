// Master-key custody. The 32-byte vault master key is generated once and stored
// at rest encrypted by the OS keychain (Electron safeStorage → Keychain on macOS,
// DPAPI on Windows). Plaintext key material exists only in memory.

import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { safeStorage } from 'electron'
import { CRYPTO_CONSTS } from './crypto'
import { log } from './log'

const KEY_FILE = 'master.key'

/** Load the vault master key, creating + persisting one on first run. */
export function loadOrCreateMasterKey(userDataDir: string): Buffer {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'OS keychain encryption is unavailable; cannot protect the vault master key on this system',
    )
  }

  const keyPath = join(userDataDir, KEY_FILE)

  if (existsSync(keyPath)) {
    const wrapped = readFileSync(keyPath)
    const b64 = safeStorage.decryptString(wrapped)
    const key = Buffer.from(b64, 'base64')
    if (key.length !== CRYPTO_CONSTS.KEY_LEN) throw new Error('stored master key is corrupt')
    return key
  }

  const key = randomBytes(CRYPTO_CONSTS.KEY_LEN)
  const wrapped = safeStorage.encryptString(key.toString('base64'))
  writeFileSync(keyPath, wrapped, { mode: 0o600 })
  log.info('masterkey.created', { keyPath })
  return key
}
