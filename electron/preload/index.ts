// The single contextBridge surface. The renderer can touch the main process only
// through `window.vaultop` — no Node, no ipcRenderer, no filesystem. Types come
// from the shared contract; validation happens in main and renderer.

import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type { VaultopBridge } from '@shared/ipc'

const bridge: VaultopBridge = {
  invoke: (channel, request) => ipcRenderer.invoke(channel, request) as never,
  on: (event, handler) => {
    const listener = (_e: IpcRendererEvent, payload: unknown) => handler(payload as never)
    ipcRenderer.on(event, listener)
    return () => ipcRenderer.removeListener(event, listener)
  },
  pickFiles: () => ipcRenderer.invoke('dialog:pickFiles') as Promise<string[]>,
  getPathForFile: (file) => webUtils.getPathForFile(file as File),
}

contextBridge.exposeInMainWorld('vaultop', bridge)
