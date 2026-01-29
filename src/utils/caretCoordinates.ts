/**
 * Get the pixel coordinates of the caret position within a textarea.
 * Uses a mirror div technique to accurately measure text position.
 */

export interface CaretCoordinates {
  top: number
  left: number
  height: number
}

// CSS properties to copy from textarea to mirror div
const MIRROR_PROPERTIES = [
  'direction',
  'boxSizing',
  'width',
  'height',
  'overflowX',
  'overflowY',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontSizeAdjust',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'textDecoration',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
  'MozTabSize',
  'whiteSpace',
  'wordWrap',
  'wordBreak',
  'overflowWrap',
] as const

/**
 * Get the pixel coordinates of a character position within a textarea.
 * Returns coordinates relative to the textarea's content area (inside padding/border).
 *
 * @param textarea - The textarea element
 * @param position - Character position (0-indexed)
 * @returns Coordinates { top, left, height } relative to textarea content area
 */
export function getCaretCoordinates(
  textarea: HTMLTextAreaElement,
  position: number,
): CaretCoordinates {
  const computed = getComputedStyle(textarea)

  // Create mirror div
  const mirror = document.createElement('div')
  mirror.id = 'hbs-caret-mirror'
  document.body.appendChild(mirror)

  const mirrorStyle = mirror.style
  mirrorStyle.position = 'absolute'
  mirrorStyle.visibility = 'hidden'
  mirrorStyle.whiteSpace = 'pre-wrap'
  mirrorStyle.wordWrap = 'break-word'

  // Copy relevant styles from textarea
  for (const prop of MIRROR_PROPERTIES) {
    mirrorStyle[prop as keyof CSSStyleDeclaration] = computed[prop as keyof CSSStyleDeclaration] as string
  }

  // For scrollable textareas, we need the actual width without scrollbar
  mirrorStyle.width = `${textarea.clientWidth}px`
  mirrorStyle.height = 'auto'
  mirrorStyle.overflow = 'hidden'

  // Set text up to caret position
  const textContent = textarea.value.substring(0, position)
  mirror.textContent = textContent

  // Create a span to mark the caret position
  const caretSpan = document.createElement('span')
  caretSpan.textContent = '\u200b' // Zero-width space
  mirror.appendChild(caretSpan)

  // Add remaining text (to ensure wrapping is consistent)
  const remainingText = textarea.value.substring(position)
  if (remainingText) {
    mirror.appendChild(document.createTextNode(remainingText))
  }

  // Get measurements
  const spanRect = caretSpan.getBoundingClientRect()
  const mirrorRect = mirror.getBoundingClientRect()

  const coordinates: CaretCoordinates = {
    top: spanRect.top - mirrorRect.top,
    left: spanRect.left - mirrorRect.left,
    height: parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.2,
  }

  // Clean up
  document.body.removeChild(mirror)

  return coordinates
}
