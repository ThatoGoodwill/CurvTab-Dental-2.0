import {
  useEffect,
  useId,
  useRef,
} from 'react'
import { AlertTriangle, ShieldCheck } from 'lucide-react'
import './ConfirmDialog.css'

type ConfirmOptions = {
  title: string
  message: string
  confirmLabel?: string
  variant?: 'default' | 'danger'
}

type DialogProps = {
  options: ConfirmOptions
  onAccept: () => void
  onCancel: () => void
}

export function ConfirmationDialog({
  options,
  onAccept,
  onCancel,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const messageId = useId()
  const danger = options.variant === 'danger'

  useEffect(() => {
    const dialog = dialogRef.current

    if (dialog && !dialog.open) {
      dialog.showModal()
    }

    return () => {
      if (dialog?.open) dialog.close()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="ct-confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onCancel={event => {
        event.preventDefault()
        onCancel()
      }}
    >
      <div className="ct-confirm-content">
        <div className="ct-confirm-icon">
          {danger
            ? <AlertTriangle size={23} />
            : <ShieldCheck size={23} />}
        </div>

        <h2 id={titleId}>{options.title}</h2>

        <p id={messageId}>
          {options.message}
        </p>

        <div className="ct-confirm-actions">
          <button
            type="button"
            className="ct-confirm-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>

          <button
            type="button"
            className={
              danger
                ? 'ct-confirm-accept danger'
                : 'ct-confirm-accept'
            }
            onClick={onAccept}
          >
            {options.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </dialog>
  )
}

