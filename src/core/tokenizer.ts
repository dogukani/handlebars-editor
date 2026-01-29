import Handlebars from 'handlebars'
import type { HighlightToken, TokenType } from '../types'

interface HandlebarsLexer {
  setInput: (input: string) => void
  lex: () => number
  EOF: number
  yytext: string
  yylloc: { first_line: number; first_column: number; last_line: number; last_column: number }
}

interface HandlebarsParser {
  lexer: HandlebarsLexer
  terminals_: Record<number, string>
}

const Parser = (Handlebars as unknown as { Parser: HandlebarsParser }).Parser
const lexer = Parser.lexer
const terminals = Parser.terminals_

// ============================================================================
// Type Definitions
// ============================================================================

interface RawToken {
  type: string
  text: string
  start: number
  end: number
}

interface NormalizedToken {
  type: string
  text: string
  start: number
  end: number
}

interface ExpressionContext {
  type: 'mustache' | 'block-open' | 'block-close' | 'partial' | null
  isInBlockParams: boolean
  pathRootAfterHelper: boolean
}

interface AnnotatedToken extends NormalizedToken {
  context: ExpressionContext
}

// ============================================================================
// Predicate Sets
// ============================================================================

const BLOCK_OPENERS = new Set(['OPEN_BLOCK', 'OPEN_INVERSE', 'OPEN_INVERSE_CHAIN', 'OPEN_ENDBLOCK'])
const MUSTACHE_OPENERS = new Set(['OPEN', 'OPEN_UNESCAPED'])
const PARTIAL_OPENERS = new Set(['OPEN_PARTIAL', 'OPEN_PARTIAL_BLOCK'])
const EXPRESSION_OPENERS = new Set([
  'OPEN',
  'OPEN_UNESCAPED',
  'OPEN_BLOCK',
  'OPEN_INVERSE',
  'OPEN_INVERSE_CHAIN',
  'OPEN_ENDBLOCK',
  'OPEN_PARTIAL',
  'OPEN_PARTIAL_BLOCK',
])
const EXPRESSION_CLOSERS = new Set(['CLOSE', 'CLOSE_UNESCAPED', 'CLOSE_RAW_BLOCK', 'END_RAW_BLOCK'])
const ARGUMENT_TYPES = new Set(['ID', 'STRING', 'NUMBER', 'BOOLEAN', 'DATA', 'OPEN_SEXPR', 'UNDEFINED', 'NULL'])

const isBlockOpener = (type: string) => BLOCK_OPENERS.has(type)
const isMustacheOpener = (type: string) => MUSTACHE_OPENERS.has(type)
const isPartialOpener = (type: string) => PARTIAL_OPENERS.has(type)
const isExpressionOpener = (type: string) => EXPRESSION_OPENERS.has(type)
const isExpressionCloser = (type: string) => EXPRESSION_CLOSERS.has(type)
const isArgumentType = (type: string) => ARGUMENT_TYPES.has(type)

// ============================================================================
// Static Token Map (for non-ID tokens)
// ============================================================================

const TOKEN_MAP: Record<string, TokenType> = {
  CONTENT: 'text',
  COMMENT: 'comment',
  OPEN: 'brace',
  CLOSE: 'brace',
  OPEN_UNESCAPED: 'brace',
  CLOSE_UNESCAPED: 'brace',
  OPEN_RAW_BLOCK: 'brace',
  CLOSE_RAW_BLOCK: 'brace',
  END_RAW_BLOCK: 'brace',
  OPEN_BLOCK: 'brace',
  OPEN_INVERSE: 'brace',
  OPEN_INVERSE_CHAIN: 'brace',
  OPEN_ENDBLOCK: 'brace',
  OPEN_PARTIAL: 'brace',
  OPEN_PARTIAL_BLOCK: 'brace',
  OPEN_SEXPR: 'subexpr-paren',
  CLOSE_SEXPR: 'subexpr-paren',
  OPEN_BLOCK_PARAMS: 'block-keyword',
  CLOSE_BLOCK_PARAMS: 'block-keyword',
  INVERSE: 'block-keyword',
  ID: 'variable',
  STRING: 'literal',
  NUMBER: 'literal',
  BOOLEAN: 'literal',
  UNDEFINED: 'literal',
  NULL: 'literal',
  DATA: 'data-var',
  SEP: 'brace',
  EQUALS: 'brace',
}

// ============================================================================
// Stage 1: Lexer Tokenization (kept as-is)
// ============================================================================

function locToOffset(lines: string[], line: number, column: number): number {
  let offset = 0
  for (let i = 0; i < line - 1 && i < lines.length; i++) {
    offset += lines[i].length + 1
  }
  return offset + column
}

function lexerTokenize(content: string): RawToken[] {
  const tokens: RawToken[] = []
  const lines = content.split('\n')

  lexer.setInput(content)

  try {
    for (let tokenId = lexer.lex(); tokenId !== lexer.EOF; tokenId = lexer.lex()) {
      const tokenName = terminals[tokenId] || 'UNKNOWN'
      const loc = lexer.yylloc

      tokens.push({
        type: tokenName,
        text: lexer.yytext,
        start: locToOffset(lines, loc.first_line, loc.first_column),
        end: locToOffset(lines, loc.last_line, loc.last_column),
      })
    }
  } catch {
    // Lexer error - return partial results
  }

  return tokens
}

// ============================================================================
// Stage 2: Normalize Tokens (centralized error recovery)
// ============================================================================

function normalizeTokens(tokens: RawToken[]): NormalizedToken[] {
  return tokens.map((token) => {
    // Handle lexer error recovery: '.' lexed as ID instead of SEP
    if (token.type === 'ID' && token.text === '.') {
      return { ...token, type: 'SEP' }
    }
    // Handle lexer error recovery: '=' lexed as ID instead of EQUALS
    if (token.type === 'ID' && token.text === '=') {
      return { ...token, type: 'EQUALS' }
    }
    return token
  })
}

// ============================================================================
// Stage 3: Annotate Context (forward-pass state tracking)
// ============================================================================

function annotateContext(tokens: NormalizedToken[]): AnnotatedToken[] {
  const result: AnnotatedToken[] = []

  let expressionType: 'mustache' | 'block-open' | 'block-close' | 'partial' | null = null
  let isInBlockParams = false
  let helperSeen = false // Have we seen the helper/block-keyword ID in current expression?
  let pathDepth = 0 // Track if we're in a path (after SEP)

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const prev = tokens[i - 1]

    // Track expression boundaries
    if (isExpressionOpener(token.type)) {
      if (isBlockOpener(token.type)) {
        expressionType = token.type === 'OPEN_ENDBLOCK' ? 'block-close' : 'block-open'
      } else if (isPartialOpener(token.type)) {
        expressionType = 'partial'
      } else if (isMustacheOpener(token.type)) {
        expressionType = 'mustache'
      }
      helperSeen = false
      pathDepth = 0
    } else if (isExpressionCloser(token.type)) {
      expressionType = null
      helperSeen = false
      pathDepth = 0
    }

    // Track block params
    if (token.type === 'OPEN_BLOCK_PARAMS') {
      isInBlockParams = true
    } else if (token.type === 'CLOSE_BLOCK_PARAMS') {
      isInBlockParams = false
    }

    // Track if we're in a path
    if (token.type === 'SEP') {
      pathDepth++
    } else if (token.type === 'ID' && prev?.type !== 'SEP' && prev?.type !== 'DATA') {
      // Starting a new path (not continuation)
      pathDepth = 0
    }

    // Determine pathRootAfterHelper: was there a helper before this path's root?
    let pathRootAfterHelper = false
    if (token.type === 'ID') {
      if (pathDepth === 0) {
        // This is a path root - check if helper was already seen
        pathRootAfterHelper = helperSeen
      } else {
        // Path continuation - inherit from the path root
        // Look back to find the path root's context
        for (let j = i - 1; j >= 0; j--) {
          if (tokens[j].type === 'ID' && result[j]?.context.pathRootAfterHelper !== undefined) {
            // Check if this is the root or a continuation
            const prevPrev = tokens[j - 1]
            if (prevPrev?.type !== 'SEP' && prevPrev?.type !== 'DATA') {
              // Found the root
              pathRootAfterHelper = result[j].context.pathRootAfterHelper
              break
            }
          }
        }
      }
    }

    result.push({
      ...token,
      context: {
        type: expressionType,
        isInBlockParams,
        pathRootAfterHelper,
      },
    })

    // After processing an ID at path depth 0 (root), mark helper as seen
    // (for mustache expressions, the first ID is the helper/variable)
    if (
      token.type === 'ID' &&
      pathDepth === 0 &&
      !isInBlockParams &&
      prev?.type !== 'EQUALS' &&
      prev?.type !== 'DATA'
    ) {
      helperSeen = true
    }
  }

  return result
}

// ============================================================================
// Stage 4: Classify Tokens
// ============================================================================

function classifyIdToken(
  token: AnnotatedToken,
  prev: AnnotatedToken | undefined,
  next: AnnotatedToken | undefined
): TokenType {
  const { context } = token

  // 1. Special keywords
  if (token.text === 'this') {
    return 'data-var'
  }

  // 2. Block params (from context)
  if (context.isInBlockParams) {
    return 'block-param'
  }

  // 3. Hash parameters (check early, regardless of expression type)
  if (next?.type === 'EQUALS') {
    return 'hash-key'
  }
  if (prev?.type === 'EQUALS') {
    return 'hash-value'
  }

  // 4. After DATA (@)
  if (prev?.type === 'DATA') {
    return 'data-var'
  }

  // 5. Path continuation (after SEP)
  if (prev?.type === 'SEP') {
    if (context.pathRootAfterHelper) {
      return 'helper-arg'
    }
    return 'variable-path'
  }

  // 6. Expression-specific logic
  return classifyByExpressionContext(token, prev, next)
}

function classifyByExpressionContext(
  token: AnnotatedToken,
  prev: AnnotatedToken | undefined,
  next: AnnotatedToken | undefined
): TokenType {
  const { context } = token

  // Block opener: {{#if, {{/each, etc.
  if (context.type === 'block-open' || context.type === 'block-close') {
    if (isBlockOpener(prev?.type ?? '')) {
      return 'block-keyword'
    }
    // After block-keyword, this is a helper argument
    return 'helper-arg'
  }

  // Partials: {{> partial
  if (context.type === 'partial') {
    if (isPartialOpener(prev?.type ?? '')) {
      return 'helper'
    }
    return 'helper-arg'
  }

  // Subexpression helper: (helper ...)
  if (prev?.type === 'OPEN_SEXPR') {
    return 'helper'
  }

  // Mustache expression: {{...}}
  if (context.type === 'mustache') {
    if (isMustacheOpener(prev?.type ?? '')) {
      // First ID after {{ - determine if helper or variable
      if (next?.type === 'SEP') {
        return 'variable'
      }
      // If followed by an argument, it's a helper
      if (next && isArgumentType(next.type)) {
        return 'helper'
      }
      // Simple variable or incomplete expression
      return 'variable'
    }
    // After a helper, this is an argument
    return 'helper-arg'
  }

  // Default: variable
  return 'variable'
}

function classifyTokens(tokens: AnnotatedToken[]): Array<{ token: AnnotatedToken; highlightType: TokenType }> {
  return tokens.map((token, i) => {
    const prev = tokens[i - 1]
    const next = tokens[i + 1]

    let highlightType: TokenType

    if (token.type === 'ID') {
      highlightType = classifyIdToken(token, prev, next)
    } else {
      highlightType = TOKEN_MAP[token.type] || 'text'
    }

    return { token, highlightType }
  })
}

// ============================================================================
// Stage 5: Build Output (gap filling and DATA merging)
// ============================================================================

function buildOutput(
  content: string,
  classified: Array<{ token: AnnotatedToken; highlightType: TokenType }>
): HighlightToken[] {
  const result: HighlightToken[] = []
  let pos = 0

  for (let i = 0; i < classified.length; i++) {
    const { token, highlightType } = classified[i]

    // Fill gap before this token
    if (token.start > pos) {
      result.push({
        type: 'text',
        value: content.slice(pos, token.start),
        start: pos,
        end: token.start,
      })
    }

    // Merge DATA with following ID if adjacent
    if (token.type === 'DATA') {
      const nextClassified = classified[i + 1]
      if (nextClassified?.token.type === 'ID' && nextClassified.token.start === token.end) {
        result.push({
          type: 'data-var',
          value: content.slice(token.start, nextClassified.token.end),
          start: token.start,
          end: nextClassified.token.end,
        })
        pos = nextClassified.token.end
        i++ // Skip next token
        continue
      }
    }

    result.push({
      type: highlightType,
      value: content.slice(token.start, token.end),
      start: token.start,
      end: token.end,
    })
    pos = token.end
  }

  // Fill gap after last token
  if (pos < content.length) {
    result.push({
      type: 'text',
      value: content.slice(pos),
      start: pos,
      end: content.length,
    })
  }

  return result
}

// ============================================================================
// Main Pipeline
// ============================================================================

export function tokenize(content: string): HighlightToken[] {
  if (!content) return []

  // Stage 1: Get raw tokens from Handlebars lexer
  const rawTokens = lexerTokenize(content)

  // Stage 2: Normalize tokens (error recovery)
  const normalizedTokens = normalizeTokens(rawTokens)

  // Stage 3: Annotate with context
  const annotatedTokens = annotateContext(normalizedTokens)

  // Stage 4: Classify tokens
  const classifiedTokens = classifyTokens(annotatedTokens)

  // Stage 5: Build output
  const result = buildOutput(content, classifiedTokens)

  return result.filter((t) => t.value.length > 0)
}
