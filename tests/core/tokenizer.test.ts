import { describe, it, expect } from 'vitest'
import { tokenize } from '../../src/core/tokenizer'

// Helper to extract just type and value for cleaner assertions
const tokens = (input: string) =>
  tokenize(input).map((t) => ({ type: t.type, value: t.value }))

const verifyReconstruction = (input: string) => {
  const result = tokenize(input)
  const reconstructed = result.map((t) => t.value).join('')
  expect(reconstructed).toBe(input)
  return result
}

// =============================================================================
// 1. Simple Variable
// =============================================================================

describe('tokenize: simple variable', () => {
  it('{{name}}', () => {
    expect(tokens('{{name}}')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'variable', value: 'name' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('tokenizes simple variable with surrounding text', () => {
    const result = verifyReconstruction('Hello {{name}}!')
    expect(result).toMatchObject([
      { type: 'text', value: 'Hello ' },
      { type: 'brace', value: '{{' },
      { type: 'variable', value: 'name' },
      { type: 'brace', value: '}}' },
      { type: 'text', value: '!' },
    ])
  })

  it('tokenizes single identifier as variable', () => {
    const result = verifyReconstruction('{{name}}')
    expect(result[1]).toMatchObject({ type: 'variable', value: 'name' })
  })
})

// =============================================================================
// 2. Nested Variable Path
// =============================================================================

describe('tokenize: nested variable path', () => {
  it('{{user.name}}', () => {
    expect(tokens('{{user.name}}')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'variable', value: 'user' },
      { type: 'brace', value: '.' },
      { type: 'variable-path', value: 'name' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('{{user.address.city}}', () => {
    expect(tokens('{{user.address.city}}')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'variable', value: 'user' },
      { type: 'brace', value: '.' },
      { type: 'variable-path', value: 'address' },
      { type: 'brace', value: '.' },
      { type: 'variable-path', value: 'city' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('tokenizes nested path in raw expression', () => {
    const result = verifyReconstruction('{{{user.bio}}}')
    expect(result).toMatchObject([
      { type: 'brace', value: '{{{' },
      { type: 'variable', value: 'user' },
      { type: 'brace', value: '.' },
      { type: 'variable-path', value: 'bio' },
      { type: 'brace', value: '}}}' },
    ])
  })

  it('tokenizes identifier followed by dot as variable (not helper)', () => {
    const result = verifyReconstruction('{{user.name}}')
    expect(result[1]).toMatchObject({ type: 'variable', value: 'user' })
  })
})

// =============================================================================
// 3. Helper with Argument
// =============================================================================

describe('tokenize: helper with argument', () => {
  it('{{formatDate date}}', () => {
    expect(tokens('{{formatDate date}}')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'helper', value: 'formatDate' },
      { type: 'text', value: ' ' },
      { type: 'helper-arg', value: 'date' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('{{helper arg1 arg2}}', () => {
    expect(tokens('{{helper arg1 arg2}}')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'helper', value: 'helper' },
      { type: 'text', value: ' ' },
      { type: 'helper-arg', value: 'arg1' },
      { type: 'text', value: ' ' },
      { type: 'helper-arg', value: 'arg2' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('tokenizes identifier with argument as helper', () => {
    const result = verifyReconstruction('{{formatDate date}}')
    expect(result[1]).toMatchObject({ type: 'helper', value: 'formatDate' })
    expect(result[3]).toMatchObject({ type: 'helper-arg', value: 'date' })
  })

  it('tokenizes identifier with string argument as helper', () => {
    const result = verifyReconstruction('{{t "hello"}}')
    expect(result[1]).toMatchObject({ type: 'helper', value: 't' })
  })

  it('tokenizes identifier with number argument as helper', () => {
    const result = verifyReconstruction('{{repeat 3}}')
    expect(result[1]).toMatchObject({ type: 'helper', value: 'repeat' })
  })
})

// =============================================================================
// 4. Helper with Path Argument
// =============================================================================

describe('tokenize: helper with path argument', () => {
  it('{{formatDate user.createdAt}}', () => {
    expect(tokens('{{formatDate user.createdAt}}')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'helper', value: 'formatDate' },
      { type: 'text', value: ' ' },
      { type: 'helper-arg', value: 'user' },
      { type: 'brace', value: '.' },
      { type: 'helper-arg', value: 'createdAt' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('{{helper a.b.c}}', () => {
    expect(tokens('{{helper a.b.c}}')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'helper', value: 'helper' },
      { type: 'text', value: ' ' },
      { type: 'helper-arg', value: 'a' },
      { type: 'brace', value: '.' },
      { type: 'helper-arg', value: 'b' },
      { type: 'brace', value: '.' },
      { type: 'helper-arg', value: 'c' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('tokenizes helper with nested path argument', () => {
    const result = verifyReconstruction('{{formatDate user.createdAt}}')
    expect(result[1]).toMatchObject({ type: 'helper', value: 'formatDate' })
    expect(result[3]).toMatchObject({ type: 'helper-arg', value: 'user' })
  })
})

// =============================================================================
// 5. Block Helper
// =============================================================================

describe('tokenize: block helper', () => {
  it('{{#if active}}', () => {
    expect(tokens('{{#if active}}')).toEqual([
      { type: 'brace', value: '{{#' },
      { type: 'block-keyword', value: 'if' },
      { type: 'text', value: ' ' },
      { type: 'helper-arg', value: 'active' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('{{#each items}}', () => {
    expect(tokens('{{#each items}}')).toEqual([
      { type: 'brace', value: '{{#' },
      { type: 'block-keyword', value: 'each' },
      { type: 'text', value: ' ' },
      { type: 'helper-arg', value: 'items' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('{{#unless disabled}}', () => {
    expect(tokens('{{#unless disabled}}')).toEqual([
      { type: 'brace', value: '{{#' },
      { type: 'block-keyword', value: 'unless' },
      { type: 'text', value: ' ' },
      { type: 'helper-arg', value: 'disabled' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('{{#with user}}', () => {
    expect(tokens('{{#with user}}')).toEqual([
      { type: 'brace', value: '{{#' },
      { type: 'block-keyword', value: 'with' },
      { type: 'text', value: ' ' },
      { type: 'helper-arg', value: 'user' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('tokenizes block keyword correctly', () => {
    const result = verifyReconstruction('{{#if condition}}{{/if}}')
    expect(result[1]).toMatchObject({ type: 'block-keyword', value: 'if' })
  })

  it('tokenizes block helper argument', () => {
    const result = verifyReconstruction('{{#each items}}{{/each}}')
    expect(result[1]).toMatchObject({ type: 'block-keyword', value: 'each' })
    expect(result[3]).toMatchObject({ type: 'helper-arg', value: 'items' })
  })
})

// =============================================================================
// 6. Block Helper with Path
// =============================================================================

describe('tokenize: block helper with path', () => {
  it('{{#if user.isPremium}}', () => {
    expect(tokens('{{#if user.isPremium}}')).toEqual([
      { type: 'brace', value: '{{#' },
      { type: 'block-keyword', value: 'if' },
      { type: 'text', value: ' ' },
      { type: 'helper-arg', value: 'user' },
      { type: 'brace', value: '.' },
      { type: 'helper-arg', value: 'isPremium' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('{{#each user.orders}}', () => {
    expect(tokens('{{#each user.orders}}')).toEqual([
      { type: 'brace', value: '{{#' },
      { type: 'block-keyword', value: 'each' },
      { type: 'text', value: ' ' },
      { type: 'helper-arg', value: 'user' },
      { type: 'brace', value: '.' },
      { type: 'helper-arg', value: 'orders' },
      { type: 'brace', value: '}}' },
    ])
  })
})

// =============================================================================
// 7. Close Block
// =============================================================================

describe('tokenize: close block', () => {
  it('{{/if}}', () => {
    expect(tokens('{{/if}}')).toEqual([
      { type: 'brace', value: '{{/' },
      { type: 'block-keyword', value: 'if' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('{{/each}}', () => {
    expect(tokens('{{/each}}')).toEqual([
      { type: 'brace', value: '{{/' },
      { type: 'block-keyword', value: 'each' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('tokenizes closing block', () => {
    const result = verifyReconstruction('{{/if}}')
    expect(result[1]).toMatchObject({ type: 'block-keyword', value: 'if' })
  })
})

// =============================================================================
// 8. Else
// =============================================================================

describe('tokenize: else', () => {
  it('{{else}}', () => {
    expect(tokens('{{else}}')).toEqual([
      { type: 'block-keyword', value: '{{else}}' },
    ])
  })

  it('tokenizes else as block-keyword', () => {
    const result = verifyReconstruction('{{else}}')
    expect(result[0]).toMatchObject({ type: 'block-keyword', value: '{{else}}' })
  })

  it('tokenizes if/else block', () => {
    const result = verifyReconstruction('{{#if active}}yes{{else}}no{{/if}}')
    const values = result.map((t) => t.value).join('')
    expect(values).toBe('{{#if active}}yes{{else}}no{{/if}}')
  })
})

// =============================================================================
// 9. Data Variables
// =============================================================================

describe('tokenize: data variables', () => {
  it('{{@index}}', () => {
    expect(tokens('{{@index}}')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'data-var', value: '@index' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('{{@key}}', () => {
    expect(tokens('{{@key}}')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'data-var', value: '@key' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('{{@first}}', () => {
    expect(tokens('{{@first}}')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'data-var', value: '@first' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('{{@last}}', () => {
    expect(tokens('{{@last}}')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'data-var', value: '@last' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('{{@root}}', () => {
    expect(tokens('{{@root}}')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'data-var', value: '@root' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('{{@root.user}}', () => {
    expect(tokens('{{@root.user}}')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'data-var', value: '@root' },
      { type: 'brace', value: '.' },
      { type: 'variable-path', value: 'user' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('tokenizes data variable', () => {
    const result = verifyReconstruction('{{@index}}')
    expect(result).toMatchObject([
      { type: 'brace', value: '{{' },
      { type: 'data-var', value: '@index' },
      { type: 'brace', value: '}}' },
    ])
  })
})

// =============================================================================
// 10. This Keyword
// =============================================================================

describe('tokenize: this keyword', () => {
  it('{{this}}', () => {
    expect(tokens('{{this}}')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'data-var', value: 'this' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('tokenizes this as data-var', () => {
    const result = verifyReconstruction('{{this}}')
    expect(result).toMatchObject([
      { type: 'brace', value: '{{' },
      { type: 'data-var', value: 'this' },
      { type: 'brace', value: '}}' },
    ])
  })
})

// =============================================================================
// 11. This with Path
// =============================================================================

describe('tokenize: this with path', () => {
  it('{{this.name}}', () => {
    expect(tokens('{{this.name}}')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'data-var', value: 'this' },
      { type: 'brace', value: '.' },
      { type: 'variable-path', value: 'name' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('{{this.user.name}}', () => {
    expect(tokens('{{this.user.name}}')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'data-var', value: 'this' },
      { type: 'brace', value: '.' },
      { type: 'variable-path', value: 'user' },
      { type: 'brace', value: '.' },
      { type: 'variable-path', value: 'name' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('tokenizes this.property', () => {
    const result = verifyReconstruction('{{this.name}}')
    expect(result).toMatchObject([
      { type: 'brace', value: '{{' },
      { type: 'data-var', value: 'this' },
      { type: 'brace', value: '.' },
      { type: 'variable-path', value: 'name' },
      { type: 'brace', value: '}}' },
    ])
  })
})

// =============================================================================
// 12. Hash Parameters
// =============================================================================

describe('tokenize: hash parameters', () => {
  it('{{helper key=value}}', () => {
    expect(tokens('{{helper key=value}}')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'helper', value: 'helper' },
      { type: 'text', value: ' ' },
      { type: 'hash-key', value: 'key' },
      { type: 'brace', value: '=' },
      { type: 'hash-value', value: 'value' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('{{helper key="string"}}', () => {
    expect(tokens('{{helper key="string"}}')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'helper', value: 'helper' },
      { type: 'text', value: ' ' },
      { type: 'hash-key', value: 'key' },
      { type: 'brace', value: '=' },
      { type: 'literal', value: '"string"' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('tokenizes hash key and value', () => {
    const result = verifyReconstruction('{{helper key=value}}')
    expect(result).toMatchObject([
      { type: 'brace', value: '{{' },
      { type: 'helper', value: 'helper' },
      { type: 'text', value: ' ' },
      { type: 'hash-key', value: 'key' },
      { type: 'brace', value: '=' },
      { type: 'hash-value', value: 'value' },
      { type: 'brace', value: '}}' },
    ])
  })
})

// =============================================================================
// 13. Multiple Hash Parameters
// =============================================================================

describe('tokenize: multiple hash parameters', () => {
  it('{{helper a=1 b=2}}', () => {
    expect(tokens('{{helper a=1 b=2}}')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'helper', value: 'helper' },
      { type: 'text', value: ' ' },
      { type: 'hash-key', value: 'a' },
      { type: 'brace', value: '=' },
      { type: 'literal', value: '1' },
      { type: 'text', value: ' ' },
      { type: 'hash-key', value: 'b' },
      { type: 'brace', value: '=' },
      { type: 'literal', value: '2' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('{{helper class="btn" id="submit"}}', () => {
    expect(tokens('{{helper class="btn" id="submit"}}')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'helper', value: 'helper' },
      { type: 'text', value: ' ' },
      { type: 'hash-key', value: 'class' },
      { type: 'brace', value: '=' },
      { type: 'literal', value: '"btn"' },
      { type: 'text', value: ' ' },
      { type: 'hash-key', value: 'id' },
      { type: 'brace', value: '=' },
      { type: 'literal', value: '"submit"' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('tokenizes multiple hash params', () => {
    const result = verifyReconstruction('{{helper a=1 b=2}}')
    const hashKeys = result.filter((t) => t.type === 'hash-key')
    expect(hashKeys).toHaveLength(2)
  })
})

// =============================================================================
// 14. Block Params
// =============================================================================

describe('tokenize: block params', () => {
  it('{{#each items as |item|}}', () => {
    expect(tokens('{{#each items as |item|}}')).toEqual([
      { type: 'brace', value: '{{#' },
      { type: 'block-keyword', value: 'each' },
      { type: 'text', value: ' ' },
      { type: 'helper-arg', value: 'items' },
      { type: 'text', value: ' ' },
      { type: 'block-keyword', value: 'as |' },
      { type: 'block-param', value: 'item' },
      { type: 'block-keyword', value: '|' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('{{#each items as |item idx|}}', () => {
    expect(tokens('{{#each items as |item idx|}}')).toEqual([
      { type: 'brace', value: '{{#' },
      { type: 'block-keyword', value: 'each' },
      { type: 'text', value: ' ' },
      { type: 'helper-arg', value: 'items' },
      { type: 'text', value: ' ' },
      { type: 'block-keyword', value: 'as |' },
      { type: 'block-param', value: 'item' },
      { type: 'text', value: ' ' },
      { type: 'block-param', value: 'idx' },
      { type: 'block-keyword', value: '|' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('tokenizes each with block params', () => {
    const result = verifyReconstruction('{{#each items as |item|}}{{item}}{{/each}}')
    const types = result.map((t) => t.type)
    expect(types).toContain('block-param')
  })
})

// =============================================================================
// 15. Subexpression
// =============================================================================

describe('tokenize: subexpression', () => {
  it('{{helper (sub arg)}}', () => {
    expect(tokens('{{helper (sub arg)}}')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'helper', value: 'helper' },
      { type: 'text', value: ' ' },
      { type: 'subexpr-paren', value: '(' },
      { type: 'helper', value: 'sub' },
      { type: 'text', value: ' ' },
      { type: 'helper-arg', value: 'arg' },
      { type: 'subexpr-paren', value: ')' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('{{outer (inner a.b)}}', () => {
    expect(tokens('{{outer (inner a.b)}}')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'helper', value: 'outer' },
      { type: 'text', value: ' ' },
      { type: 'subexpr-paren', value: '(' },
      { type: 'helper', value: 'inner' },
      { type: 'text', value: ' ' },
      { type: 'helper-arg', value: 'a' },
      { type: 'brace', value: '.' },
      { type: 'helper-arg', value: 'b' },
      { type: 'subexpr-paren', value: ')' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('tokenizes subexpression', () => {
    const result = verifyReconstruction('{{outer (inner arg)}}')
    const types = result.map((t) => t.type)
    expect(types).toContain('subexpr-paren')
  })
})

// =============================================================================
// 16. Raw/Unescaped
// =============================================================================

describe('tokenize: raw/unescaped', () => {
  it('{{{html}}}', () => {
    expect(tokens('{{{html}}}')).toEqual([
      { type: 'brace', value: '{{{' },
      { type: 'variable', value: 'html' },
      { type: 'brace', value: '}}}' },
    ])
  })

  it('{{{user.bio}}}', () => {
    expect(tokens('{{{user.bio}}}')).toEqual([
      { type: 'brace', value: '{{{' },
      { type: 'variable', value: 'user' },
      { type: 'brace', value: '.' },
      { type: 'variable-path', value: 'bio' },
      { type: 'brace', value: '}}}' },
    ])
  })

  it('tokenizes raw expression', () => {
    const result = verifyReconstruction('{{{raw}}}')
    expect(result).toMatchObject([
      { type: 'brace', value: '{{{' },
      { type: 'variable', value: 'raw' },
      { type: 'brace', value: '}}}' },
    ])
  })
})

// =============================================================================
// 17. Partial
// =============================================================================

describe('tokenize: partial', () => {
  it('{{> partialName}}', () => {
    expect(tokens('{{> partialName}}')).toEqual([
      { type: 'brace', value: '{{>' },
      { type: 'text', value: ' ' },
      { type: 'helper', value: 'partialName' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('{{> header title="Hello"}}', () => {
    expect(tokens('{{> header title="Hello"}}')).toEqual([
      { type: 'brace', value: '{{>' },
      { type: 'text', value: ' ' },
      { type: 'helper', value: 'header' },
      { type: 'text', value: ' ' },
      { type: 'hash-key', value: 'title' },
      { type: 'brace', value: '=' },
      { type: 'literal', value: '"Hello"' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('tokenizes partial', () => {
    const result = verifyReconstruction('{{> partial}}')
    expect(result).toMatchObject([
      { type: 'brace', value: '{{>' },
      { type: 'text', value: ' ' },
      { type: 'helper', value: 'partial' },
      { type: 'brace', value: '}}' },
    ])
  })
})

// =============================================================================
// 18. Comments
// =============================================================================

describe('tokenize: comments', () => {
  it('{{! comment }}', () => {
    expect(tokens('{{! comment }}')).toEqual([
      { type: 'comment', value: '{{! comment }}' },
    ])
  })

  it('{{!-- block comment --}}', () => {
    expect(tokens('{{!-- block comment --}}')).toEqual([
      { type: 'comment', value: '{{!-- block comment --}}' },
    ])
  })

  it('tokenizes comment', () => {
    const result = verifyReconstruction('{{! comment }}')
    expect(result[0].type).toBe('comment')
  })

  it('tokenizes block comment', () => {
    const result = verifyReconstruction('{{!-- block comment --}}')
    expect(result[0].type).toBe('comment')
  })
})

// =============================================================================
// 19. Incomplete Expression (Error Recovery)
// =============================================================================

describe('tokenize: incomplete expression (error recovery)', () => {
  it('{{user.', () => {
    expect(tokens('{{user.')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'variable', value: 'user' },
      { type: 'brace', value: '.' },
    ])
  })

  it('{{helper arg.', () => {
    expect(tokens('{{helper arg.')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'helper', value: 'helper' },
      { type: 'text', value: ' ' },
      { type: 'helper-arg', value: 'arg' },
      { type: 'brace', value: '.' },
    ])
  })

  it('{{', () => {
    const result = tokens('{{')
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  it('tokenizes valid parts when template has incomplete expression', () => {
    const input = 'Hello {{name}} and {{'
    const result = tokenize(input)
    expect(result.find((t) => t.type === 'variable')).toBeDefined()
  })

  it('tokenizes valid parts with {{ in middle', () => {
    const input = '{{greeting}}\n{{\n{{name}}'
    const result = tokenize(input)
    const variables = result.filter((t) => t.type === 'variable')
    expect(variables.length).toBeGreaterThanOrEqual(1)
  })

  it('tokenizes even when syntax errors exist', () => {
    const result = tokenize('{{name}} {{#if}} {{other}}')
    const variables = result.filter((t) => t.type === 'variable')
    expect(variables.length).toBeGreaterThanOrEqual(1)
    expect(result.find((t) => t.type === 'block-keyword')).toBeDefined()
  })

  it('tokenizes unclosed blocks', () => {
    const result = tokenize('{{#each items}}{{name}}')
    expect(result.find((t) => t.type === 'block-keyword')).toBeDefined()
    expect(result.find((t) => t.type === 'variable')).toBeDefined()
  })
})

// =============================================================================
// 20. Mixed Content
// =============================================================================

describe('tokenize: mixed content', () => {
  it('Hello {{name}}!', () => {
    expect(tokens('Hello {{name}}!')).toEqual([
      { type: 'text', value: 'Hello ' },
      { type: 'brace', value: '{{' },
      { type: 'variable', value: 'name' },
      { type: 'brace', value: '}}' },
      { type: 'text', value: '!' },
    ])
  })

  it('{{greeting}}, {{name}}!', () => {
    expect(tokens('{{greeting}}, {{name}}!')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'variable', value: 'greeting' },
      { type: 'brace', value: '}}' },
      { type: 'text', value: ', ' },
      { type: 'brace', value: '{{' },
      { type: 'variable', value: 'name' },
      { type: 'brace', value: '}}' },
      { type: 'text', value: '!' },
    ])
  })
})

// =============================================================================
// 21. Literals
// =============================================================================

describe('tokenize: literals', () => {
  it('{{helper "string"}}', () => {
    expect(tokens('{{helper "string"}}')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'helper', value: 'helper' },
      { type: 'text', value: ' ' },
      { type: 'literal', value: '"string"' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('{{helper 42}}', () => {
    expect(tokens('{{helper 42}}')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'helper', value: 'helper' },
      { type: 'text', value: ' ' },
      { type: 'literal', value: '42' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('{{helper true}}', () => {
    expect(tokens('{{helper true}}')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'helper', value: 'helper' },
      { type: 'text', value: ' ' },
      { type: 'literal', value: 'true' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('{{helper false}}', () => {
    expect(tokens('{{helper false}}')).toEqual([
      { type: 'brace', value: '{{' },
      { type: 'helper', value: 'helper' },
      { type: 'text', value: ' ' },
      { type: 'literal', value: 'false' },
      { type: 'brace', value: '}}' },
    ])
  })

  it('tokenizes string literal', () => {
    const result = verifyReconstruction('{{helper "string"}}')
    expect(result.find((t) => t.type === 'literal')).toBeDefined()
  })

  it('tokenizes number literal', () => {
    const result = verifyReconstruction('{{helper 42}}')
    expect(result.find((t) => t.type === 'literal')).toBeDefined()
  })
})

// =============================================================================
// 22. Inverse Blocks
// =============================================================================

describe('tokenize: inverse blocks', () => {
  it('{{^if condition}}', () => {
    expect(tokens('{{^if condition}}')).toEqual([
      { type: 'brace', value: '{{^' },
      { type: 'block-keyword', value: 'if' },
      { type: 'text', value: ' ' },
      { type: 'helper-arg', value: 'condition' },
      { type: 'brace', value: '}}' },
    ])
  })
})

// =============================================================================
// 23. Delimiters Styling
// =============================================================================

describe('tokenize: delimiters styling', () => {
  it('styles opening braces as brace type', () => {
    const result = tokenize('{{name}}')
    expect(result[0]).toMatchObject({ type: 'brace', value: '{{' })
  })

  it('styles closing braces as brace type', () => {
    const result = tokenize('{{name}}')
    expect(result[result.length - 1]).toMatchObject({ type: 'brace', value: '}}' })
  })

  it('styles dot separator as brace type', () => {
    const result = tokenize('{{user.name}}')
    const dotToken = result.find((t) => t.value === '.')
    expect(dotToken?.type).toBe('brace')
  })

  it('styles equals sign as brace type', () => {
    const result = tokenize('{{helper key=val}}')
    const equalsToken = result.find((t) => t.value === '=')
    expect(equalsToken?.type).toBe('brace')
  })
})

// =============================================================================
// 24. Complex Real-world Examples
// =============================================================================

describe('tokenize: complex real-world examples', () => {
  it('{{#if user.isPremium}}Welcome!{{else}}Upgrade{{/if}}', () => {
    const result = tokens('{{#if user.isPremium}}Welcome!{{else}}Upgrade{{/if}}')

    expect(result[0]).toEqual({ type: 'brace', value: '{{#' })
    expect(result[1]).toEqual({ type: 'block-keyword', value: 'if' })
    expect(result[3]).toEqual({ type: 'helper-arg', value: 'user' })
    expect(result[5]).toEqual({ type: 'helper-arg', value: 'isPremium' })
    expect(result.find(t => t.value === '{{else}}')).toEqual({ type: 'block-keyword', value: '{{else}}' })
    expect(result[result.length - 2]).toEqual({ type: 'block-keyword', value: 'if' })
  })

  it('{{#each items}}{{@index}}: {{this.name}}{{/each}}', () => {
    const result = tokens('{{#each items}}{{@index}}: {{this.name}}{{/each}}')

    expect(result[1]).toEqual({ type: 'block-keyword', value: 'each' })
    expect(result.find(t => t.value === '@index')).toEqual({ type: 'data-var', value: '@index' })
    expect(result.find(t => t.value === 'this')).toEqual({ type: 'data-var', value: 'this' })
  })

  it('tokenizes if block', () => {
    const result = verifyReconstruction('{{#if active}}yes{{/if}}')
    const types = result.map((t) => t.type)
    expect(types).toContain('block-keyword')
    expect(types).toContain('brace')
  })
})
