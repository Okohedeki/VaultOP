// Typed access to the preload bridge. The renderer never touches ipcRenderer or
// Node directly — only this object, whose shape is the shared contract.

import type { VaultopBridge } from '@shared/ipc'

declare global {
  interface Window {
    vaultop?: VaultopBridge
  }
}

export function getBridge(): VaultopBridge {
  if (!window.vaultop) {
    throw new Error('VaultOP bridge unavailable — preload did not load')
  }
  return window.vaultop
}

export const bridgeReady = (): boolean => typeof window.vaultop !== 'undefined'
