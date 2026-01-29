import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  type UIEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { BLOCK_HELPER_NAMES, extract, tokenize } from '../core/parser'
import type { AutocompleteOption, AutocompleteState, BlockContext, HandlebarsEditorProps } from '../types'
import { AutocompletePortal } from './AutocompletePortal'

const DATA_VARS_EACH = ['this', '@index', '@first', '@last', '@key']
const DATA_VARS_GLOBAL = ['@root']

type MatchType = 'exact' | 'prefix' | 'partial' | 'none'

function getMatchType(value: string, filter: string): MatchType {
  if (!filter) return 'prefix'
  const valueLower = value.toLowerCase()
  const filterLower = filter.toLowerCase()
  if (valueLower === filterLower) return 'exact'
  if (valueLower.startsWith(filterLower)) return 'prefix'
  if (valueLower.includes(filterLower)) return 'partial'
  return 'none'
}

function buildOptions(
  customHelpers: string[],
  extractedVariables: { path: string; context?: string }[],
  isRaw: boolean,
  contextPath: BlockContext | null,
  filterText: string,
): AutocompleteOption[] {
  const options: { option: AutocompleteOption; matchType: MatchType }[] = []
  const seen = new Set<string>()

  // Check if filter has a dot prefix (e.g., "user." or "user.is")
  const lastDotIndex = filterText.lastIndexOf('.')
  const hasPrefix = lastDotIndex !== -1
  const _prefix = hasPrefix ? filterText.slice(0, lastDotIndex + 1) : ''
  const leafFilter = hasPrefix ? filterText.slice(lastDotIndex + 1) : filterText

  const addOption = (value: string, type: AutocompleteOption['type']) => {
    if (seen.has(value)) return
    const matchType = getMatchType(value, leafFilter)
    if (matchType === 'none') return
    seen.add(value)
    options.push({ option: { value, type }, matchType })
  }

  if (!hasPrefix) {
    // No dot prefix - show block helpers, custom helpers, and root variables
    if (!isRaw) {
      for (const name of BLOCK_HELPER_NAMES) {
        addOption(`#${name}`, 'block-open')
      }
      for (const name of BLOCK_HELPER_NAMES) {
        addOption(`/${name}`, 'block-close')
      }
      addOption('else', 'block-close')
    }

    for (const helper of customHelpers) {
      addOption(helper, 'helper')
    }

    // Context-specific data variables (only show when inside a block)
    if (contextPath) {
      if (contextPath.isEach) {
        for (const v of DATA_VARS_EACH) {
          addOption(v, 'data-var')
        }
      }
      for (const param of contextPath.blockParams) {
        addOption(param, 'variable')
      }
      for (const v of DATA_VARS_GLOBAL) {
        addOption(v, 'data-var')
      }
    }

    // Root variables only
    const rootVars = new Set<string>()
    for (const v of extractedVariables) {
      const rootName = v.path.split('.')[0].replace('[]', '')
      rootVars.add(rootName)
    }
    for (const v of rootVars) {
      addOption(v, 'variable')
    }
  } else {
    // Has dot prefix (e.g., "user.") - show only matching nested properties
    const prefixPath = filterText.slice(0, lastDotIndex).replace(/\[\]$/, '')

    extractedVariables.forEach((v) => {
      const pathWithoutBrackets = v.path.replace(/\[\]/g, '')
      if (pathWithoutBrackets.startsWith(`${prefixPath}.`)) {
        const remaining = pathWithoutBrackets.slice(prefixPath.length + 1)
        const childName = remaining.split('.')[0]
        addOption(childName, 'variable')
      }
    })
  }

  // Sort: matchType (exact > prefix > partial), then type, then alphabetically
  // Type priority: context data vars > variables > helpers > block open > block close
  const typeOrder: Record<AutocompleteOption['type'], number> = {
    'data-var': 0,    // Context-specific (@index in #each), highly relevant
    'variable': 1,    // Most common use case
    'helper': 2,      // Frequently used
    'block-open': 3,  // Less common, {{# naturally filters to these
    'block-close': 4, // Rarely typed fresh, {{/ naturally filters to these
  }

  const matchOrder: Record<MatchType, number> = {
    'exact': 0,
    'prefix': 1,
    'partial': 2,
    'none': 3,
  }

  options.sort((a, b) => {
    const matchCompare = matchOrder[a.matchType] - matchOrder[b.matchType]
    if (matchCompare !== 0) return matchCompare
    const typeCompare = typeOrder[a.option.type] - typeOrder[b.option.type]
    if (typeCompare !== 0) return typeCompare
    return a.option.value.localeCompare(b.option.value)
  })

  return options.map((o) => o.option)
}

function getContextAtCursor(template: string, cursorPos: number): BlockContext | null {
  const textBefore = template.slice(0, cursorPos)
  const blockStack: BlockContext[] = []

  // Match both open and close blocks, processing in order of occurrence
  const blockRegex = /\{\{#(each|with)\s+([^\s}]+)(?:\s+as\s*\|([^|]+)\|)?|\{\{\/(each|with)\}\}/g

  for (const match of textBefore.matchAll(blockRegex)) {
    if (match[1]) {
      // Opening block: {{#each items as |item index|}} or {{#with user}}
      const type = match[1] as 'each' | 'with'
      const variable = match[2]
      const blockParamsStr = match[3] || ''
      const blockParams = blockParamsStr.split(/\s+/).filter(Boolean)

      blockStack.push({
        type,
        variable,
        blockParams,
        isEach: type === 'each',
      })
    } else if (match[4]) {
      // Closing block: {{/each}} or {{/with}}
      const closeType = match[4]
      // Pop matching block from stack
      for (let i = blockStack.length - 1; i >= 0; i--) {
        if (blockStack[i].type === closeType) {
          blockStack.splice(i, 1)
          break
        }
      }
    }
  }

  return blockStack.length > 0 ? blockStack[blockStack.length - 1] : null
}

function isInsideComment(template: string, cursorPos: number): boolean {
  const textBefore = template.slice(0, cursorPos)

  // Check for block comment {{!-- ... --}}
  const lastBlockCommentOpen = textBefore.lastIndexOf('{{!--')
  if (lastBlockCommentOpen !== -1) {
    const closeAfterOpen = textBefore.slice(lastBlockCommentOpen).indexOf('--}}')
    if (closeAfterOpen === -1) {
      // We're after {{!-- but no --}} yet before cursor
      return true
    }
  }

  // Check for inline comment {{! ... }}
  const lastInlineCommentOpen = textBefore.lastIndexOf('{{!')
  if (lastInlineCommentOpen !== -1) {
    // Make sure it's not a block comment
    const afterOpen = textBefore.slice(lastInlineCommentOpen)
    if (!afterOpen.startsWith('{{!--')) {
      const closeAfterOpen = afterOpen.indexOf('}}')
      if (closeAfterOpen === -1) {
        return true
      }
    }
  }

  return false
}

function isInsideCompletedExpression(template: string, cursorPos: number): boolean {
  // Check if cursor is inside an already closed {{ ... }}
  const textBefore = template.slice(0, cursorPos)
  const textAfter = template.slice(cursorPos)

  // Find last {{ before cursor
  const lastOpen = textBefore.lastIndexOf('{{')
  if (lastOpen === -1) return false

  // Check if there's a }} between lastOpen and cursor
  const betweenText = textBefore.slice(lastOpen)
  if (betweenText.includes('}}')) return false

  // Check if there's a }} after cursor (completing the expression)
  const nextClose = textAfter.indexOf('}}')
  if (nextClose === -1) return false

  // Check there's no {{ between cursor and the }}
  const untilClose = textAfter.slice(0, nextClose)
  return !untilClose.includes('{{')
}

export function HandlebarsEditor({
  value,
  onChange,
  placeholder = 'Enter template...',
  readOnly = false,
  className = '',
  style,
  theme,
  customHelpers = [],
  autocomplete = true,
  minHeight = 100,
}: HandlebarsEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()

  const [autocompleteState, setAutocompleteState] = useState<AutocompleteState>({
    isOpen: false,
    options: [],
    selectedIndex: 0,
    triggerStart: 0,
    filterText: '',
    isRaw: false,
    contextPath: null,
  })

  // Extract all variables with their paths for autocomplete
  const extractedVariables = useMemo(() => {
    const result = extract(value)
    return result.variables.map((v) => ({ path: v.path, context: v.context }))
  }, [value])

  // Tokenize for highlighting
  const tokens = useMemo(() => tokenize(value), [value])

  // Generate highlighted content
  const highlightedContent = useMemo((): ReactNode => {
    if (!value) {
      return <span className="hbs-editor-placeholder">{placeholder}</span>
    }

    return tokens.map((token) => {
      if (token.type === 'text') {
        return token.value
      }
      return (
        <span key={token.start} className={`hbs-token-${token.type}`}>
          {token.value}
        </span>
      )
    })
  }, [tokens, value, placeholder])

  // Close autocomplete helper
  const closeAutocomplete = useCallback(() => {
    setAutocompleteState((prev) => ({ ...prev, isOpen: false }))
  }, [])

  // Update autocomplete based on cursor position and text
  const updateAutocomplete = useCallback(
    (text: string, cursorPos: number) => {
      if (!autocomplete || readOnly) {
        closeAutocomplete()
        return
      }

      // Don't open if inside a comment or completed expression
      if (isInsideComment(text, cursorPos) || isInsideCompletedExpression(text, cursorPos)) {
        closeAutocomplete()
        return
      }

      const textBefore = text.slice(0, cursorPos)

      // Check for trigger: {{ or {{{ followed by optional filter text
      // Also handle nested: {{name. or {{name.sub
      const triggerMatch = textBefore.match(/(\{\{\{?)([#/]?[\w.@]*)$/)

      if (!triggerMatch) {
        closeAutocomplete()
        return
      }

      const braces = triggerMatch[1]
      const filterText = triggerMatch[2] || ''
      const triggerStart = cursorPos - filterText.length
      const isRaw = braces === '{{{'

      // Check if typing closing braces
      if (filterText.includes('}')) {
        closeAutocomplete()
        return
      }

      // Get context
      const contextPath = getContextAtCursor(text, cursorPos)

      // Build options
      const options = buildOptions(customHelpers, extractedVariables, isRaw, contextPath, filterText)

      if (options.length === 0) {
        closeAutocomplete()
        return
      }

      setAutocompleteState({
        isOpen: true,
        options,
        selectedIndex: 0,
        triggerStart,
        filterText,
        isRaw,
        contextPath,
      })
    },
    [autocomplete, readOnly, customHelpers, extractedVariables, closeAutocomplete],
  )

  // Handle text change
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value
      onChange?.(newValue)
      updateAutocomplete(newValue, e.target.selectionStart)

      // Sync scroll position after content change (for paste operations)
      if (highlightRef.current) {
        highlightRef.current.scrollTop = e.target.scrollTop
        highlightRef.current.scrollLeft = e.target.scrollLeft
      }
    },
    [onChange, updateAutocomplete],
  )

  // Insert selected option
  const insertOption = useCallback(
    (option: AutocompleteOption) => {
      const textarea = textareaRef.current
      if (!textarea) return

      const { triggerStart, filterText, isRaw } = autocompleteState
      const closeBraces = isRaw ? '}}}' : '}}'

      // Get the prefix that was already typed (e.g., "user." from "user.isP")
      const lastDotIndex = filterText.lastIndexOf('.')
      const prefix = lastDotIndex !== -1 ? filterText.slice(0, lastDotIndex + 1) : ''

      let insert: string
      let cursorOffset: number

      if (option.type === 'block-open' && !isRaw) {
        const blockName = option.value.slice(1)
        insert = `${option.value} }}{{/${blockName}}}`
        cursorOffset = option.value.length + 1
      } else if (option.type !== 'block-close' && option.value !== 'else') {
        insert = `${prefix}${option.value}${closeBraces}`
        cursorOffset = insert.length
      } else {
        insert = `${option.value}${closeBraces}`
        cursorOffset = insert.length
      }

      textarea.focus()
      textarea.setSelectionRange(triggerStart, textarea.selectionStart)
      document.execCommand('insertText', false, insert)

      const newPos = triggerStart + cursorOffset
      textarea.setSelectionRange(newPos, newPos)

      onChange?.(textarea.value)
      closeAutocomplete()
    },
    [autocompleteState, onChange, closeAutocomplete],
  )

  // Handle scroll sync
  const handleScroll = useCallback((e: UIEvent<HTMLTextAreaElement>) => {
    const { scrollTop, scrollLeft } = e.currentTarget

    if (highlightRef.current) {
      highlightRef.current.scrollTop = scrollTop
      highlightRef.current.scrollLeft = scrollLeft
    }
  }, [])

  // Handle blur
  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      // Check for portal dropdown
      const portal = document.querySelector('.hbs-autocomplete-portal')
      if (portal?.contains(e.relatedTarget as Node)) {
        return
      }
      closeAutocomplete()
    },
    [closeAutocomplete],
  )

  // Handle selection change (cursor movement)
  const handleSelect = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea || !autocompleteState.isOpen) return

    // Close if cursor moved away from trigger position
    const cursorPos = textarea.selectionStart
    const textBefore = value.slice(0, cursorPos)
    const triggerMatch = textBefore.match(/(\{\{\{?)([#/]?[\w.@]*)$/)

    if (!triggerMatch) {
      closeAutocomplete()
    }
  }, [autocompleteState.isOpen, value, closeAutocomplete])

  // Handle keyboard
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      const textarea = e.currentTarget

      // Tab handling (works regardless of autocomplete state)
      if (e.key === 'Tab') {
        // If autocomplete is open, Tab selects the option
        if (autocompleteState.isOpen) {
          e.preventDefault()
          const option = autocompleteState.options[autocompleteState.selectedIndex]
          if (option) {
            insertOption(option)
          }
          return
        }

        // Otherwise, handle indentation
        e.preventDefault()
        const { selectionStart } = textarea

        if (e.shiftKey) {
          // Shift+Tab: outdent
          const textBefore = value.slice(0, selectionStart)
          const lineStart = textBefore.lastIndexOf('\n') + 1
          const linePrefix = value.slice(lineStart, selectionStart)

          // Remove leading tab or spaces (up to tab-size)
          const match = linePrefix.match(/^(\t| {2})/)
          if (match) {
            const removeCount = match[1].length
            const newValue = value.slice(0, lineStart) + value.slice(lineStart + removeCount)
            onChange?.(newValue)
            // Adjust cursor position
            const newPos = Math.max(lineStart, selectionStart - removeCount)
            setTimeout(() => textarea.setSelectionRange(newPos, newPos), 0)
          }
        } else {
          // Tab: indent (insert tab or spaces)
          document.execCommand('insertText', false, '\t')
          onChange?.(textarea.value)
        }
        return
      }

      // Let undo/redo pass through (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y)
      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'y')) {
        return
      }

      // Rest of keyboard handling only when autocomplete is open
      if (!autocompleteState.isOpen) return

      const { options, selectedIndex } = autocompleteState
      const pageSize = 8

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setAutocompleteState((prev) => ({
            ...prev,
            selectedIndex: Math.min(selectedIndex + 1, options.length - 1),
          }))
          break

        case 'ArrowUp':
          e.preventDefault()
          setAutocompleteState((prev) => ({
            ...prev,
            selectedIndex: Math.max(selectedIndex - 1, 0),
          }))
          break

        case 'Home':
          e.preventDefault()
          setAutocompleteState((prev) => ({ ...prev, selectedIndex: 0 }))
          break

        case 'End':
          e.preventDefault()
          setAutocompleteState((prev) => ({
            ...prev,
            selectedIndex: options.length - 1,
          }))
          break

        case 'PageDown':
          e.preventDefault()
          setAutocompleteState((prev) => ({
            ...prev,
            selectedIndex: Math.min(selectedIndex + pageSize, options.length - 1),
          }))
          break

        case 'PageUp':
          e.preventDefault()
          setAutocompleteState((prev) => ({
            ...prev,
            selectedIndex: Math.max(selectedIndex - pageSize, 0),
          }))
          break

        case 'Enter':
          e.preventDefault()
          if (options[selectedIndex]) {
            insertOption(options[selectedIndex])
          }
          break

        case 'Escape':
          e.preventDefault()
          closeAutocomplete()
          break

        case 'ArrowLeft':
        case 'ArrowRight':
          // Let the cursor move, then check if we should close
          setTimeout(() => handleSelect(), 0)
          break
      }
    },
    [autocompleteState, insertOption, closeAutocomplete, handleSelect, value, onChange],
  )


  // Generate theme CSS variables
  const themeStyles = useMemo(() => {
    if (!theme) return {}

    const cssVars: Record<string, string> = {}
    const mapping: Record<string, string> = {
      variable: '--hbs-color-variable',
      variablePath: '--hbs-color-variable-path',
      blockKeyword: '--hbs-color-block-keyword',
      blockParam: '--hbs-color-block-param',
      helper: '--hbs-color-helper',
      helperArg: '--hbs-color-helper-arg',
      hashKey: '--hbs-color-hash-key',
      hashValue: '--hbs-color-hash-value',
      literal: '--hbs-color-literal',
      dataVar: '--hbs-color-data-var',
      subexprParen: '--hbs-color-subexpr-paren',
      comment: '--hbs-color-comment',
      raw: '--hbs-color-raw',
      brace: '--hbs-color-brace',
      text: '--hbs-color-text',
      background: '--hbs-color-background',
      caret: '--hbs-color-caret',
      border: '--hbs-color-border',
      placeholder: '--hbs-color-placeholder',
    }

    for (const [key, cssVar] of Object.entries(mapping)) {
      const value = theme[key as keyof typeof theme]
      if (value) {
        cssVars[cssVar] = value
      }
    }

    return cssVars
  }, [theme])

  // Sync scroll position when value changes (handles paste, programmatic changes)
  useEffect(() => {
    const textarea = textareaRef.current
    const highlight = highlightRef.current
    if (!textarea || !highlight) return

    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
      highlight.scrollTop = textarea.scrollTop
      highlight.scrollLeft = textarea.scrollLeft
    })
  }, [value])

  // Scroll selected item into view
  useEffect(() => {
    if (!autocompleteState.isOpen) return

    // Query portal dropdown
    const container = document.querySelector('.hbs-autocomplete-portal')
    if (!container) return

    const items = container.querySelectorAll('.hbs-autocomplete-item')
    const selected = items[autocompleteState.selectedIndex] as HTMLElement
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' })
    }
  }, [autocompleteState.selectedIndex, autocompleteState.isOpen])

  // Close on outside click
  useEffect(() => {
    if (!autocompleteState.isOpen) return

    const container = containerRef.current

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      // Check for portal dropdown
      const portal = document.querySelector('.hbs-autocomplete-portal')
      if (portal?.contains(target)) {
        return
      }
      if (container && !container.contains(target)) {
        closeAutocomplete()
      }
    }

    const handleClickInside = (e: MouseEvent) => {
      const target = e.target as Node
      // Check for portal dropdown
      const portal = document.querySelector('.hbs-autocomplete-portal')
      if (portal?.contains(target)) {
        return
      }
      // Close if clicking inside editor but outside autocomplete dropdown
      if (
        container?.contains(target) &&
        target !== textareaRef.current
      ) {
        closeAutocomplete()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    container?.addEventListener('mousedown', handleClickInside)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      container?.removeEventListener('mousedown', handleClickInside)
    }
  }, [autocompleteState.isOpen, closeAutocomplete])

  // Render option with match highlighting
  const renderOption = useCallback(
    (option: AutocompleteOption, index: number) => {
      const { filterText, selectedIndex } = autocompleteState
      const isSelected = index === selectedIndex

      // Get the leaf filter (after last dot) for highlighting
      const lastDotIndex = filterText.lastIndexOf('.')
      const leafFilter = lastDotIndex !== -1 ? filterText.slice(lastDotIndex + 1) : filterText

      // Strip prefix symbols for display (badge already shows the type)
      let displayValue = option.value
      if (option.type === 'block-open' && displayValue.startsWith('#')) {
        displayValue = displayValue.slice(1)
      } else if (option.type === 'block-close' && displayValue.startsWith('/')) {
        displayValue = displayValue.slice(1)
      } else if (option.type === 'data-var' && displayValue.startsWith('@')) {
        displayValue = displayValue.slice(1)
      }

      // Highlight matched portion (use display value for rendering)
      let content: ReactNode
      const filterLower = leafFilter.toLowerCase().replace(/^[#/@]/, '')
      const valueLower = displayValue.toLowerCase()
      const matchIndex = valueLower.indexOf(filterLower)

      if (filterLower.length > 0 && matchIndex !== -1) {
        const before = displayValue.slice(0, matchIndex)
        const match = displayValue.slice(matchIndex, matchIndex + filterLower.length)
        const after = displayValue.slice(matchIndex + filterLower.length)
        content = (
          <>
            {before}
            <span className="hbs-autocomplete-match">{match}</span>
            {after}
          </>
        )
      } else {
        content = displayValue
      }

      // Type indicator - subtle gray symbol
      let symbol = ''
      switch (option.type) {
        case 'block-open':
          symbol = '#'
          break
        case 'block-close':
          symbol = '/'
          break
        case 'data-var':
          symbol = '@'
          break
        case 'helper':
          symbol = 'ƒ'
          break
        case 'variable':
          symbol = '·'
          break
      }
      const typeIndicator = <span className="hbs-autocomplete-type">{symbol}</span>

      return (
        <button
          key={option.value}
          id={`${listboxId}-option-${index}`}
          type="button"
          role="option"
          aria-selected={isSelected}
          className={`hbs-autocomplete-item hbs-autocomplete-${option.type} ${isSelected ? 'hbs-selected' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault()
            insertOption(option)
          }}
          onMouseEnter={() =>
            setAutocompleteState((prev) => ({
              ...prev,
              selectedIndex: index,
            }))
          }
        >
          {typeIndicator}
          <span className="hbs-autocomplete-value">{content}</span>
        </button>
      )
    },
    [autocompleteState, insertOption, listboxId],
  )

  const containerClasses = ['hbs-editor', readOnly ? 'hbs-readonly' : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      ref={containerRef}
      className={containerClasses}
      style={{
        ...themeStyles,
        minHeight: typeof minHeight === 'number' ? `${minHeight}px` : minHeight,
        ...style,
      }}
    >
      <div ref={highlightRef} className="hbs-editor-highlight">
        {highlightedContent}
      </div>

      <textarea
        ref={textareaRef}
        className="hbs-editor-textarea"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
        onBlur={handleBlur}
        onSelect={handleSelect}
        placeholder=""
        readOnly={readOnly}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={autocomplete && autocompleteState.isOpen}
        aria-controls={listboxId}
        aria-activedescendant={
          autocomplete &&
          autocompleteState.isOpen &&
          autocompleteState.options[autocompleteState.selectedIndex]
            ? `${listboxId}-option-${autocompleteState.selectedIndex}`
            : undefined
        }
      />

      {autocomplete && (
        <AutocompletePortal
          textareaRef={textareaRef}
          containerRef={containerRef}
          triggerPosition={autocompleteState.triggerStart}
          isOpen={autocompleteState.isOpen}
          listboxId={listboxId}
        >
          {autocompleteState.options.map((option, index) => renderOption(option, index))}
        </AutocompletePortal>
      )}
    </div>
  )
}

export default HandlebarsEditor
