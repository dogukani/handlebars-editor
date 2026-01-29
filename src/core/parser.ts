import Handlebars from 'handlebars'
import type { ExtractedVariable, ExtractionResult } from '../types'
import { tokenize } from './tokenizer'

export { tokenize }

/** Block helpers that can be used with #/syntax */
export const BLOCK_HELPER_NAMES = ['if', 'unless', 'each', 'with'] as const

// ============================================================================
// Constants
// ============================================================================

const BUILT_IN_HELPERS = new Set([...BLOCK_HELPER_NAMES, 'lookup', 'log', 'this', 'else'])

const CONTEXT_HELPERS = new Set(['each', 'with'])

const ARGUMENT_TOKENS = new Set(['ID', 'STRING', 'NUMBER', 'BOOLEAN', 'DATA', 'OPEN_SEXPR'])

// ============================================================================
// Types
// ============================================================================

interface ExpressionToken {
  name: string
  text: string
}

interface Expression {
  type: 'mustache' | 'block' | 'endblock' | 'partial'
  tokens: ExpressionToken[]
  helperName: string | null
}

interface BlockFrame {
  helper: string
  context: string
}

interface ExtractionContext {
  blockStack: BlockFrame[]
  contextPrefix: string | null
  rootContext: string | null
}

interface HandlebarsLexer {
  setInput: (input: string) => void
  conditionStack: string[]
  lex: () => number
  EOF: number
  yytext: string
  yylloc?: { last_column: number }
}

interface HandlebarsParser {
  lexer: HandlebarsLexer
  terminals_: Record<number, string>
}

const Parser = (Handlebars as unknown as { Parser: HandlebarsParser }).Parser
const lexer = Parser.lexer
const terminals = Parser.terminals_

// ============================================================================
// Pure Utility Functions
// ============================================================================

function isBuiltIn(name: string): boolean {
  return BUILT_IN_HELPERS.has(name) || name.startsWith('@')
}

function isArgumentToken(token: ExpressionToken): boolean {
  return ARGUMENT_TOKENS.has(token.name)
}

function collectPath(tokens: ExpressionToken[], startIdx: number): string[] {
  const path: string[] = []
  let expectingId = true
  for (let i = startIdx; i < tokens.length; i++) {
    const tok = tokens[i]
    if (tok.name === 'EQUALS') {
      break
    }
    if (tok.name === 'ID') {
      if (!expectingId) {
        break
      }
      if (tokens[i + 1]?.name === 'EQUALS') {
        break
      }
      path.push(tok.text)
      expectingId = false
    } else if (tok.name === 'SEP') {
      expectingId = true
    } else {
      break
    }
  }
  return path
}

function createVariable(
  name: string,
  path: string,
  blockType?: string,
  context?: string
): ExtractedVariable {
  return {
    name,
    path,
    type: blockType ? 'block' : path.includes('.') || context ? 'nested' : 'simple',
    blockType: blockType as 'if' | 'each' | 'with' | 'unless' | undefined,
    context,
  }
}

function computeContextPath(blockStack: BlockFrame[]): { prefix: string; root: string } | null {
  const parts: string[] = []
  let rootContext: string | null = null

  for (const block of blockStack) {
    if (CONTEXT_HELPERS.has(block.helper) && block.context) {
      if (!rootContext) rootContext = block.context
      parts.push(block.helper === 'each' ? `${block.context}[]` : block.context)
    }
  }

  if (parts.length === 0 || !rootContext) return null
  return { root: rootContext, prefix: `${parts.join('.')}.` }
}

// ============================================================================
// Expression Parsing (Stage 1 & 2)
// ============================================================================

interface ParsedContent {
  expressions: Expression[]
}

function parseExpressions(content: string): ParsedContent {
  const expressions: Expression[] = []
  let remaining = content

  while (remaining.length > 0) {
    const result = parseSegment(remaining)
    expressions.push(...result.expressions)

    if (result.consumed === remaining.length) break

    const afterError = remaining.slice(result.consumed)
    const nextOpen = afterError.search(/\{\{/)

    if (nextOpen === -1) break

    remaining = afterError.slice(nextOpen)
  }

  return { expressions }
}

interface SegmentResult {
  expressions: Expression[]
  consumed: number
}

function parseSegment(content: string): SegmentResult {
  lexer.setInput(content)
  lexer.conditionStack = ['INITIAL']

  const expressions: Expression[] = []
  let lastPosition = 0
  let inExpression = false
  let expressionType: 'mustache' | 'block' | 'endblock' | 'partial' | null = null
  let tokens: ExpressionToken[] = []

  try {
    for (let tokenId = lexer.lex(); tokenId !== lexer.EOF; tokenId = lexer.lex()) {
      const tokenName = terminals[tokenId]
      const text = lexer.yytext

      lastPosition = lexer.yylloc?.last_column ?? lastPosition

      if (
        tokenName === 'OPEN_RAW_BLOCK' ||
        tokenName === 'CLOSE_RAW_BLOCK' ||
        tokenName === 'END_RAW_BLOCK'
      ) {
        continue
      }

      if (tokenName === 'OPEN' || tokenName === 'OPEN_UNESCAPED') {
        inExpression = true
        expressionType = 'mustache'
        tokens = []
        continue
      }

      if (tokenName === 'OPEN_PARTIAL' || tokenName === 'OPEN_PARTIAL_BLOCK') {
        inExpression = true
        expressionType = 'partial'
        tokens = []
        continue
      }

      if (
        tokenName === 'OPEN_BLOCK' ||
        tokenName === 'OPEN_INVERSE' ||
        tokenName === 'OPEN_INVERSE_CHAIN'
      ) {
        inExpression = true
        expressionType = 'block'
        tokens = []
        continue
      }

      if (tokenName === 'OPEN_ENDBLOCK') {
        inExpression = true
        expressionType = 'endblock'
        tokens = []
        continue
      }

      if (tokenName === 'CLOSE' || tokenName === 'CLOSE_UNESCAPED') {
        if (expressionType) {
          const helperName = tokens[0]?.text ?? null
          expressions.push({
            type: expressionType,
            tokens: [...tokens],
            helperName,
          })
        }
        inExpression = false
        tokens = []
        continue
      }

      if (inExpression) {
        tokens.push({ name: tokenName, text })
      }
    }
    return { expressions, consumed: content.length }
  } catch {
    return { expressions, consumed: lastPosition }
  }
}

// ============================================================================
// Variable Extraction (Stage 3 & 4)
// ============================================================================

function extractFromMustache(
  expr: Expression,
  ctx: ExtractionContext,
  variables: Map<string, ExtractedVariable>
): void {
  const tokens = expr.tokens
  if (tokens.length === 0) return

  if (tokens[0]?.name === 'DATA') return

  const firstName = tokens[0]?.text

  if (isBuiltIn(firstName)) {
    extractArguments(tokens, 1, ctx, variables)
  } else {
    const path = collectPath(tokens, 0)
    if (path.length > 0) {
      const pathTokenCount = path.length * 2 - 1
      const endIdx = pathTokenCount
      const nextTok = tokens[endIdx]
      const hasArguments = nextTok && isArgumentToken(nextTok)

      if (hasArguments) {
        extractArguments(tokens, endIdx, ctx, variables)
      } else {
        addVariable(path, ctx, variables)
      }
    }
  }
}

function extractFromBlock(
  expr: Expression,
  ctx: ExtractionContext,
  variables: Map<string, ExtractedVariable>
): BlockFrame {
  const tokens = expr.tokens
  const firstName = tokens[0]?.text

  if (CONTEXT_HELPERS.has(firstName)) {
    if (tokens[1]?.name === 'OPEN_SEXPR') {
      extractArguments(tokens, 1, ctx, variables)
      return { helper: firstName, context: '' }
    } else {
      let idx = 1
      while (idx < tokens.length && tokens[idx].name !== 'ID') idx++
      if (idx < tokens.length) {
        const argPath = collectPath(tokens, idx)
        if (argPath.length > 0 && !isBuiltIn(argPath[0])) {
          addVariable(argPath, ctx, variables, firstName)
        }
        return { helper: firstName, context: argPath[0] || '' }
      }
      return { helper: firstName, context: '' }
    }
  } else if (BUILT_IN_HELPERS.has(firstName)) {
    if (tokens[1]?.name === 'OPEN_SEXPR') {
      extractArguments(tokens, 1, ctx, variables)
    } else {
      let idx = 1
      while (idx < tokens.length && tokens[idx].name !== 'ID') idx++
      if (idx < tokens.length) {
        const argPath = collectPath(tokens, idx)
        if (argPath.length > 0 && !isBuiltIn(argPath[0])) {
          addVariable(argPath, ctx, variables, firstName)
        }
      }
    }
    return { helper: firstName, context: '' }
  }

  return { helper: firstName, context: '' }
}

function extractFromPartial(
  expr: Expression,
  ctx: ExtractionContext,
  variables: Map<string, ExtractedVariable>
): void {
  const tokens = expr.tokens
  let idx = 1
  while (idx < tokens.length && (tokens[idx].name === 'SEP' || tokens[idx].name === 'ID')) {
    if (tokens[idx].name === 'ID' && tokens[idx - 1]?.name !== 'SEP') {
      break
    }
    idx++
  }
  extractArguments(tokens, idx, ctx, variables)
}

function extractArguments(
  tokens: ExpressionToken[],
  startIdx: number,
  ctx: ExtractionContext,
  variables: Map<string, ExtractedVariable>
): void {
  for (let i = startIdx; i < tokens.length; i++) {
    const tok = tokens[i]

    // Skip subexpression delimiters
    if (tok.name === 'OPEN_SEXPR' || tok.name === 'CLOSE_SEXPR') {
      continue
    }

    if (tok.name === 'DATA') continue
    if (tokens[i - 1]?.name === 'DATA') continue

    if (tok.name === 'EQUALS') continue
    if (tok.name === 'ID' && tokens[i + 1]?.name === 'EQUALS') continue

    if (tok.name === 'ID' && !isBuiltIn(tok.text)) {
      const prevTok = tokens[i - 1]
      if (prevTok?.name === 'OPEN_SEXPR') continue

      const argPath = collectPath(tokens, i)
      if (argPath.length > 0) {
        addVariable(argPath, ctx, variables)
        i += argPath.length * 2 - 2
      }
    }
  }
}

function addVariable(
  path: string[],
  ctx: ExtractionContext,
  variables: Map<string, ExtractedVariable>,
  blockType?: string
): void {
  const name = path[0]
  const contextInfo = ctx.contextPrefix && ctx.rootContext
    ? { prefix: ctx.contextPrefix, root: ctx.rootContext }
    : null

  let fullPath: string
  let context: string | undefined

  if (contextInfo) {
    fullPath = contextInfo.prefix + path.join('.')
    context = contextInfo.root
  } else {
    fullPath = path.join('.')
    context = undefined
  }

  if (!variables.has(fullPath)) {
    variables.set(fullPath, createVariable(name, fullPath, blockType, context))
  }
}

function updateBlockStack(stack: BlockFrame[], expr: Expression): BlockFrame[] {
  if (expr.type === 'endblock') {
    return stack.length > 0 ? stack.slice(0, -1) : stack
  }
  return stack
}

function extractVariablesFromExpressions(expressions: Expression[]): ExtractedVariable[] {
  const variables = new Map<string, ExtractedVariable>()
  let blockStack: BlockFrame[] = []

  for (const expr of expressions) {
    const contextInfo = computeContextPath(blockStack)
    const ctx: ExtractionContext = {
      blockStack,
      contextPrefix: contextInfo?.prefix ?? null,
      rootContext: contextInfo?.root ?? null,
    }

    if (expr.type === 'mustache') {
      extractFromMustache(expr, ctx, variables)
    } else if (expr.type === 'block') {
      const frame = extractFromBlock(expr, ctx, variables)
      blockStack = [...blockStack, frame]
    } else if (expr.type === 'partial') {
      extractFromPartial(expr, ctx, variables)
    } else if (expr.type === 'endblock') {
      blockStack = updateBlockStack(blockStack, expr)
    }
  }

  return Array.from(variables.values())
}

// ============================================================================
// Public API
// ============================================================================

export function extract(content: string): ExtractionResult {
  const { expressions } = parseExpressions(content)
  const variables = extractVariablesFromExpressions(expressions)
  const rootVariables = [...new Set(
    variables.filter((v) => !v.context).map((v) => v.name)
  )]
  return { variables, rootVariables }
}

export interface InterpolateOptions {
  helpers?: Record<string, (...args: unknown[]) => unknown>
}

export function interpolate(
  content: string,
  variables?: Record<string, unknown>,
  options?: InterpolateOptions,
): string {
  if (!variables) return content

  const hbs = options?.helpers ? Handlebars.create() : Handlebars

  if (options?.helpers) {
    for (const [name, fn] of Object.entries(options.helpers)) {
      hbs.registerHelper(name, fn)
    }
  }

  return hbs.compile(content)(variables)
}
