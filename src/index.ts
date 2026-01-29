// Main components
export { HandlebarsEditor, HandlebarsEditor as default } from './components/Editor'
export { HandlebarsHighlight } from './components/Highlight'

// Parser utilities
export { extract, tokenize, interpolate } from './core/parser'
export type { InterpolateOptions } from './core/parser'

// Types
export type {
  ExtractedVariable,
  ExtractionResult,
  TokenType,
  HighlightToken,
  ThemeColors,
  HandlebarsEditorProps,
  AutocompleteState,
} from './types'
