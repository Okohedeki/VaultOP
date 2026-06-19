// Auto-detection for the blur gate — prefills suggested blur masks so the human
// refines instead of drawing from scratch. Uses object detection (DETR via
// transformers.js, download-on-first-use) to locate people/faces. Lazy + best-
// effort; the mandatory human verification sits on top regardless of the model.
//
// Region-class explicit detection (NudeNet) is a documented future upgrade behind
// the same interface — this ships a real, working prefill today.

export interface DetectedRegion {
  x: number // normalized 0..1
  y: number
  w: number
  h: number
  cls: string
  confidence: number
}

export interface Detector {
  readonly version: string
  readonly available: boolean
  /** Detect regions of interest in a single frame image. */
  detectImage(imagePath: string): Promise<DetectedRegion[]>
}

/** Safe default: no auto-detection → every platform-bound cut needs human masks. */
export class NoopDetector implements Detector {
  readonly version = 'noop-v1'
  readonly available = false
  async detectImage(): Promise<DetectedRegion[]> {
    return []
  }
}

/** DETR object detector — suggests blur regions over detected people/faces. */
export class ObjectDetector implements Detector {
  readonly version = 'detr-resnet-50'
  readonly available = true
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pipe: any = null

  constructor(private readonly cacheDir: string) {}

  private async ensure(): Promise<
    (img: string, opts: unknown) => Promise<Array<{ label: string; score: number; box: { xmin: number; ymin: number; xmax: number; ymax: number } }>>
  > {
    if (this.pipe) return this.pipe
    const specifier = '@huggingface/transformers'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tf = (await import(specifier)) as any
    tf.env.cacheDir = this.cacheDir
    tf.env.allowLocalModels = false
    this.pipe = await tf.pipeline('object-detection', 'Xenova/detr-resnet-50')
    return this.pipe
  }

  async detectImage(imagePath: string): Promise<DetectedRegion[]> {
    const pipe = await this.ensure()
    const out = await pipe(imagePath, { threshold: 0.5, percentage: true })
    return out
      .filter((d) => d.label === 'person')
      .map((d) => ({
        x: d.box.xmin,
        y: d.box.ymin,
        w: d.box.xmax - d.box.xmin,
        h: d.box.ymax - d.box.ymin,
        cls: d.label,
        confidence: d.score,
      }))
  }
}
