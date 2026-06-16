import { useEffect, useRef, useState } from 'react'
import { getBridge } from '../lib/bridge'

const cache = new Map<string, string>()

/** Lazily decrypts a segment thumbnail (via IPC) only when scrolled into view. */
export function Thumb({ segmentId, alt }: { segmentId: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(() => cache.get(segmentId) ?? null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (src) return
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect()
        getBridge()
          .invoke('thumb:get', { segmentId })
          .then((r) => {
            if (r.dataUrl) {
              cache.set(segmentId, r.dataUrl)
              setSrc(r.dataUrl)
            }
          })
          .catch(() => {})
      }
    })
    io.observe(el)
    return () => io.disconnect()
  }, [segmentId, src])

  return (
    <div className="thumb" ref={ref}>
      {src ? <img src={src} alt={alt} loading="lazy" /> : <div className="thumb__ph" />}
    </div>
  )
}
