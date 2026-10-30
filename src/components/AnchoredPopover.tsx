import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

interface AnchoredPopoverProps {
  open: boolean
  anchorRef: RefObject<HTMLElement>
  onClose: () => void
  children: ReactNode
  width?: number
  align?: 'left' | 'right'
  className?: string
  ariaLabel?: string
}

type PopoverPosition = {
  left: number
  top: number
  width: number
  maxHeight: number
}

const MOBILE_BREAKPOINT = 640
const VIEWPORT_GUTTER = 12

const AnchoredPopover = ({
  open,
  anchorRef,
  onClose,
  children,
  width = 360,
  align = 'right',
  className = '',
  ariaLabel,
}: AnchoredPopoverProps) => {
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<PopoverPosition | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }

    const updatePosition = () => {
      const anchor = anchorRef.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const viewportWidth = document.documentElement.clientWidth
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const mobile = viewportWidth < MOBILE_BREAKPOINT
      const panelWidth = mobile
        ? Math.max(0, viewportWidth - VIEWPORT_GUTTER * 2)
        : Math.min(width, viewportWidth - VIEWPORT_GUTTER * 2)
      const preferredLeft = align === 'right' ? rect.right - panelWidth : rect.left
      const left = mobile
        ? VIEWPORT_GUTTER
        : Math.min(
          Math.max(VIEWPORT_GUTTER, preferredLeft),
          viewportWidth - panelWidth - VIEWPORT_GUTTER,
        )
      const top = Math.max(VIEWPORT_GUTTER, rect.bottom + 8)
      const bottomSpace = mobile ? 84 : VIEWPORT_GUTTER

      setPosition({
        left,
        top,
        width: panelWidth,
        maxHeight: Math.max(180, viewportHeight - top - bottomSpace),
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    window.visualViewport?.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      window.visualViewport?.removeEventListener('resize', updatePosition)
    }
  }, [align, anchorRef, open, width])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!anchorRef.current?.contains(target) && !panelRef.current?.contains(target)) onClose()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [anchorRef, onClose, open])

  if (!open || !position) return null

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={ariaLabel}
      className={`lumi-theme-scope lumi-theme-menu fixed z-[200] min-w-0 overflow-x-hidden overflow-y-auto rounded-2xl ${className}`}
      style={position}
    >
      {children}
    </div>,
    document.body,
  )
}

export default AnchoredPopover
