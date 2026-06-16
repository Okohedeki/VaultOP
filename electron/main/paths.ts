import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

/** Filesystem layout for one vault, rooted at a base directory. */
export interface VaultPaths {
  base: string
  dbFile: string
  blobsDir: string
  tmpDir: string
}

/** Resolve and ensure the on-disk layout exists. */
export function resolveVaultPaths(baseDir: string): VaultPaths {
  const paths: VaultPaths = {
    base: baseDir,
    dbFile: join(baseDir, 'vault.db'),
    blobsDir: join(baseDir, 'blobs'),
    tmpDir: join(baseDir, 'tmp'),
  }
  mkdirSync(paths.blobsDir, { recursive: true })
  mkdirSync(paths.tmpDir, { recursive: true })
  return paths
}
