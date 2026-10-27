import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const modalStack: symbol[] = []
let originalOverflow = ''

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  closeOnBackdrop?: boolean
}

const Modal = ({ isOpen, onClose, title, children, closeOnBackdrop = true }: ModalProps) => {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const titleId = useId()
  useEffect(() => {
    if (!isOpen) return
    const token = Symbol('modal')
    const previous = document.activeElement as HTMLElement | null
    if (!modalStack.length) { originalOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden' }
    modalStack.push(token)
    const focusable = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]') || []).filter(element => element.getClientRects().length > 0)
    const frame = requestAnimationFrame(() => { (panelRef.current?.querySelector<HTMLElement>('[data-autofocus], [autofocus]') || focusable()[0] || panelRef.current)?.focus() })
    const onKey = (event: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== token) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); return }
      if (event.key !== 'Tab') return
      const items = focusable()
      const first = items[0], last = items[items.length - 1]
      if (!first) { event.preventDefault(); panelRef.current?.focus(); return }
      if (!panelRef.current?.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) { event.preventDefault(); (event.shiftKey ? last : first).focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', onKey, true); const index = modalStack.indexOf(token); if (index >= 0) modalStack.splice(index, 1); if (!modalStack.length) document.body.style.overflow = originalOverflow; if (previous?.isConnected) previous.focus() }
  }, [isOpen])

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(event) => {
            if (closeOnBackdrop && event.currentTarget === event.target) onClose()
          }}
          className="fixed inset-0 z-[120] flex items-end justify-center overflow-hidden bg-black/50 backdrop-blur-sm sm:items-center"
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-label={title ? undefined : 'Диалог'}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="lumi-panel lumi-text flex max-h-[calc(100dvh-env(safe-area-inset-top))] w-full min-w-0 max-w-4xl flex-col overflow-hidden rounded-t-2xl border shadow-2xl sm:mx-4 sm:max-h-[90vh] sm:rounded-2xl"
          >
            <div className="lumi-border flex items-center justify-between border-b px-4 py-4 sm:px-8 sm:py-6">
              {title && <h2 id={titleId} className="lumi-text min-w-0 pr-3 text-xl font-bold sm:text-2xl">{title}</h2>}
              <button
                onClick={onClose}
                className="lumi-control p-2 rounded-xl transition-colors"
                aria-label="Закрыть окно"
              >
                <X className="lumi-muted w-6 h-6" />
              </button>
            </div>
            <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:p-8">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>, document.body
  )
}

export default Modal
