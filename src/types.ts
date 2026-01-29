import type { CSSProperties } from 'react'

/**
 * Extracted variable/input from a Handlebars template
 */
export interface ExtractedVariable {
  /** Root variable name (e.g., "person" for "person.name") */
  name: string
  /** Full path (e.g., "person.name") */
  path: string
  /** Type of variable */
  type: 'simple' | 'nested' | 'block'
  /** Block type if this is a block helper parameter */
  blockType?: 'if' | 'each' | 'with' | 'unless'
  /** Context path if inside a block (e.g., "items[]" for vars inside #each items) */
  context?: string
}

/**
 * Result of extracting variables from a template
 */
export interface ExtractionResult {
  /** All extracted variables with full details */
  variables: ExtractedVariable[]
  /** Unique root variable names */
  rootVariables: string[]
}

/**
 * Token types for syntax highlighting
 */
export type TokenType =
  | 'text'
  | 'variable'
  | 'variable-path'
  | 'block-keyword'
  | 'block-param'
  | 'helper'
  | 'helper-arg'
  | 'hash-key'
  | 'hash-value'
  | 'literal'
  | 'data-var'
  | 'subexpr-paren'
  | 'comment'
  | 'raw'
  | 'brace'

/**
 * A single token from tokenization
 */
export interface HighlightToken {
  type: TokenType
  value: string
  start: number
  end: number
}

/**
 * Theme colors for syntax highlighting
 */
export interface ThemeColors {
  /** Simple variables like {{name}} */
  variable?: string
  /** Nested paths like {{person.name}} */
  variablePath?: string
  /** Block keywords like #if, /each, else */
  blockKeyword?: string
  /** Block parameters */
  blockParam?: string
  /** Helper names like {{uppercase name}} */
  helper?: string
  /** Helper arguments */
  helperArg?: string
  /** Hash keys like key= in {{helper key=value}} */
  hashKey?: string
  /** Hash values */
  hashValue?: string
  /** Literals like "string", 123, true */
  literal?: string
  /** Data variables like @index, @key */
  dataVar?: string
  /** Subexpression parentheses */
  subexprParen?: string
  /** Comments */
  comment?: string
  /** Raw output {{{raw}}} */
  raw?: string
  /** Braces {{ and }} */
  brace?: string
  /** Text color */
  text?: string
  /** Background color */
  background?: string
  /** Caret/cursor color */
  caret?: string
  /** Border color */
  border?: string
  /** Placeholder text color */
  placeholder?: string
}

/**
 * Props for the HandlebarsEditor component
 */
export interface HandlebarsEditorProps {
  /** Current template value */
  value: string
  /** Called when value changes */
  onChange?: (value: string) => void
  /** Placeholder text when empty */
  placeholder?: string
  /** Whether the editor is read-only */
  readOnly?: boolean
  /** Custom class name */
  className?: string
  /** Inline styles */
  style?: CSSProperties
  /** Theme colors (overrides CSS variables) */
  theme?: Partial<ThemeColors>
  /** Additional helpers to show in autocomplete */
  customHelpers?: string[]
  /** Whether to show autocomplete */
  autocomplete?: boolean
  /** Minimum height */
  minHeight?: string | number
}

/**
 * Autocomplete option with metadata
 */
export interface AutocompleteOption {
  /** Display value (the part to insert) */
  value: string
  /** Type of option for styling */
  type: 'block-open' | 'block-close' | 'helper' | 'variable' | 'data-var'
}

/**
 * Block context information
 */
export interface BlockContext {
  type: 'each' | 'with'
  variable: string
  blockParams: string[]
  isEach: boolean
}

/**
 * Autocomplete state
 */
export interface AutocompleteState {
  isOpen: boolean
  options: AutocompleteOption[]
  selectedIndex: number
  /** Position where the replaceable text starts (after {{) */
  triggerStart: number
  /** Current filter text typed by user */
  filterText: string
  /** Whether triggered by triple braces {{{ for raw output */
  isRaw: boolean
  /** Current block context if inside #each/#with */
  contextPath: BlockContext | null
}
