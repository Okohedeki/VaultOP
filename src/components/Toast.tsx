import { useEffect } from 'react'

export interface ToastMsg {
  id: number
  text: string
  emoji?: string
  tone?: 'ok' | 'accent'
}

/** A brief, earned "Success Moment" — auto-dismisses; one at a time. */
export function Toast({ toast, onDone }: { toast: ToastMsg | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onDone, 3000)
    return () => clearTimeout(t)
  }, [toast, onDone])

  if (!toast) return null
  return (
    <div key={toast.id} className={`toast toast--${toast.tone ?? 'accent'}`} role="status">
      {toast.emoji && (
        <span className="toast__emoji" aria-hidden>
          {toast.emoji}
        </span>
      )}
      <span className="toast__text">{toast.text}</span>
    </div>
  )
}
