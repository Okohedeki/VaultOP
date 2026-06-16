import { useCallback, useRef, useState, type DragEvent } from 'react'
import { Button } from '../design/primitives'
import { getBridge } from '../lib/bridge'

interface Props {
  onAdd: (paths: string[]) => Promise<void>
  onPick: () => Promise<void>
}

/** Drag-drop intake. Resolves dropped File objects to absolute paths via the
 *  preload bridge (Electron removed File.path), then hands them to ingest. */
export function Dropzone({ onAdd, onPick }: Props) {
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const depth = useRef(0)

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault()
      depth.current = 0
      setOver(false)
      const files = Array.from(e.dataTransfer.files)
      if (!files.length) return
      const bridge = getBridge()
      const paths = files.map((f) => bridge.getPathForFile(f)).filter(Boolean)
      setBusy(true)
      try {
        await onAdd(paths)
      } finally {
        setBusy(false)
      }
    },
    [onAdd],
  )

  return (
    <div
      className={`dropzone ${over ? 'dropzone--over' : ''}`}
      role="button"
      tabIndex={0}
      aria-label="Add footage"
      onClick={() => void onPick()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') void onPick()
      }}
      onDragEnter={(e) => {
        e.preventDefault()
        depth.current += 1
        setOver(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        depth.current -= 1
        if (depth.current <= 0) setOver(false)
      }}
      onDrop={(e) => void handleDrop(e)}
    >
      <div className="dropzone__title">{busy ? 'Adding…' : 'Drop raw footage here'}</div>
      <div>It’s encrypted on arrival, transcoded to a working master, and added to the vault.</div>
      <div style={{ marginTop: 'var(--sp-4)' }}>
        <Button
          variant="primary"
          onClick={(e) => {
            e.stopPropagation()
            void onPick()
          }}
        >
          Choose files…
        </Button>
      </div>
    </div>
  )
}
