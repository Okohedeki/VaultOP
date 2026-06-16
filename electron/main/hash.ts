import { createHash } from 'node:crypto'

/** Stable hex digest of a value — used to build job input_hashes. */
export function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
