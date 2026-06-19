import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Native modules must stay external so they load from node_modules at runtime
// (electron-builder rebuilds them for the bundled Electron via install-app-deps).
const nativeExternals = [
  'better-sqlite3',
  'ffmpeg-static',
  'ffprobe-static',
  '@huggingface/transformers', // loaded lazily at runtime; models download on first use
]

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      lib: { entry: resolve('electron/main/index.ts') },
      rollupOptions: { external: nativeExternals },
    },
    resolve: {
      alias: { '@shared': resolve('shared') },
    },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      lib: { entry: resolve('electron/preload/index.ts') },
    },
    resolve: {
      alias: { '@shared': resolve('shared') },
    },
  },
  renderer: {
    root: '.',
    build: {
      outDir: 'out/renderer',
      rollupOptions: { input: resolve('index.html') },
    },
    resolve: {
      alias: {
        '@': resolve('src'),
        '@shared': resolve('shared'),
      },
    },
    plugins: [react()],
  },
})
