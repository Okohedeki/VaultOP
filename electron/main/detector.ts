// Detection for the blur gate.
//
// The Detector interface lets the auto-detection model drop in without touching
// callers. The default `NoopDetector` finds nothing — which is the *safe* default:
// with no model installed, nothing is auto-cleared, the review gate is mandatory,
// and the human draws masks by hand. Installing the native ONNX NudeNet model
// (MIT, 18 region classes — see docs/research.md) makes detection automatic; it
// runs via onnxruntime-node (CoreML on macOS, DirectML on Windows) with the same
// interface and the same mandatory human verification on top.

import type { Canvas } from './ffmpeg'

export interface DetectedRegion {
  x: number // normalized 0..1
  y: number
  w: number
  h: number
  cls: string // genitalia|breast|face|tattoo|plate|screen|…
  confidence: number
  startSec?: number
  endSec?: number
}

export interface Detector {
  readonly version: string
  readonly available: boolean
  detect(input: { videoPath: string; canvas: Canvas }): Promise<DetectedRegion[]>
}

/** Safe default: no auto-detection, so every platform-bound cut needs human masks. */
export class NoopDetector implements Detector {
  readonly version = 'noop-v1'
  readonly available = false
  async detect(): Promise<DetectedRegion[]> {
    return []
  }
}
