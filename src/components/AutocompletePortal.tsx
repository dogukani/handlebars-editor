import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getCaretCoordinates } from '../utils/caretCoordinates'

export interface AutocompletePortalProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  containerRef: React.RefObject<HTMLDivElement | null>
  triggerPosition: number
  isOpen: boolean
  children: ReactNode
  listboxId: string
}

interface Position {
  top: number | undefined
  bottom: number | undefined
  left: number
  maxHeight: number
  visible: boolean
}

const DROPDOWN_MIN_WIDTH = 160
const DROPDOWN_MAX_HEIGHT = 200
const DROPDOWN_MARGIN = 10

// CSS variables to read from editor for theming
const THEME_CSS_VARS = [
  '--hbs-color-text',
  '--hbs-color-border',
  '--hbs-color-placeholder',
  '--hbs-color-focus-ring',
  '--hbs-color-autocomplete-bg',
  '--hbs-color-autocomplete-selected',
]

export function AutocompletePortal({
  textareaRef,
  containerRef,
  triggerPosition,
  isOpen,
  children,
  listboxId,
}: AutocompletePortalProps) {
  const [position, setPosition] = useState<Position>({
    top: undefined,
    bottom: undefined,
    left: 0,
    maxHeight: DROPDOWN_MAX_HEIGHT,
    visible: false,
  })
  const [themeVars, setThemeVars] = useState<Record<string, string>>({})

  // Read CSS variables from editor container for theming
  useEffect(() => {
    if (!isOpen || !containerRef.current) return

    const computed = getComputedStyle(containerRef.current)
    const vars: Record<string, string> = {}

    for (const varName of THEME_CSS_VARS) {
      const value = computed.getPropertyValue(varName).trim()
      if (value) {
        vars[varName] = value
      }
    }

    setThemeVars(vars)
  }, [isOpen, containerRef])

  const calculatePosition = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea || !isOpen) {
      setPosition((prev) => ({ ...prev, visible: false }))
      return
    }

    // Get textarea's viewport position
    const textareaRect = textarea.getBoundingClientRect()

    // Get caret coordinates relative to textarea content
    const caretCoords = getCaretCoordinates(textarea, triggerPosition)

    // Adjust for textarea scroll
    const scrollTop = textarea.scrollTop
    const scrollLeft = textarea.scrollLeft

    // Calculate viewport position of caret
    const caretTop = textareaRect.top + caretCoords.top - scrollTop
    const caretLeft = textareaRect.left + caretCoords.left - scrollLeft
    const lineHeight = caretCoords.height

    // Calculate available space
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth

    const spaceBelow = viewportHeight - caretTop - lineHeight - DROPDOWN_MARGIN
    const spaceAbove = caretTop - DROPDOWN_MARGIN

    // Determine if we should open upward
    const openUpward = spaceBelow < 120 && spaceAbove > spaceBelow

    // Calculate position
    let top: number | undefined
    let bottom: number | undefined
    let maxHeight: number

    if (openUpward) {
      maxHeight = Math.min(DROPDOWN_MAX_HEIGHT, Math.max(80, spaceAbove))
      bottom = viewportHeight - caretTop + DROPDOWN_MARGIN
      top = undefined
    } else {
      maxHeight = Math.min(DROPDOWN_MAX_HEIGHT, Math.max(80, spaceBelow))
      top = caretTop + lineHeight
      bottom = undefined
    }

    // Adjust horizontal position to keep dropdown in viewport
    let left = caretLeft
    const maxLeft = viewportWidth - DROPDOWN_MIN_WIDTH - DROPDOWN_MARGIN
    if (left > maxLeft) {
      left = Math.max(DROPDOWN_MARGIN, maxLeft)
    }

    // Check if caret is visible within textarea
    const caretVisibleVertically =
      caretCoords.top - scrollTop >= 0 &&
      caretCoords.top - scrollTop < textarea.clientHeight
    const caretVisibleHorizontally =
      caretCoords.left - scrollLeft >= 0 &&
      caretCoords.left - scrollLeft < textarea.clientWidth

    const visible = caretVisibleVertically && caretVisibleHorizontally

    setPosition({ top, bottom, left, maxHeight, visible })
  }, [textareaRef, triggerPosition, isOpen])

  // Calculate position on mount and when dependencies change
  useEffect(() => {
    calculatePosition()
  }, [calculatePosition])

  // Update position on scroll/resize
  useEffect(() => {
    if (!isOpen) return

    const handleUpdate = () => {
      calculatePosition()
    }

    window.addEventListener('scroll', handleUpdate, true)
    window.addEventListener('resize', handleUpdate)

    return () => {
      window.removeEventListener('scroll', handleUpdate, true)
      window.removeEventListener('resize', handleUpdate)
    }
  }, [isOpen, calculatePosition])

  if (!isOpen || !position.visible) {
    return null
  }

  const portalStyles: React.CSSProperties = {
    top: position.top,
    bottom: position.bottom,
    left: position.left,
    maxHeight: position.maxHeight,
    ...themeVars,
  }

  return createPortal(
    <div
      id={listboxId}
      role="listbox"
      aria-label="Autocomplete suggestions"
      className="hbs-autocomplete-portal"
      style={portalStyles}
    >
      {children}
    </div>,
    document.body,
  )
}
