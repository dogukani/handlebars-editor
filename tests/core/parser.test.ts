import { describe, it, expect } from 'vitest'
import { extract, interpolate } from '../../src/core/parser'

// =============================================================================
// EXTRACT: Simple Variables
// =============================================================================

describe('extract: simple variables', () => {
  it('extracts a single simple variable', () => {
    const result = extract('{{name}}')
    expect(result.rootVariables).toEqual(['name'])
    expect(result.variables).toHaveLength(1)
    expect(result.variables[0]).toMatchObject({
      name: 'name',
      path: 'name',
      type: 'simple',
    })
  })

  it('extracts multiple simple variables', () => {
    const result = extract('{{firstName}} {{lastName}}')
    expect(result.rootVariables).toContain('firstName')
    expect(result.rootVariables).toContain('lastName')
    expect(result.variables).toHaveLength(2)
  })

  it('extracts variables with surrounding text', () => {
    const result = extract('Hello {{name}}, welcome to {{place}}!')
    expect(result.rootVariables).toContain('name')
    expect(result.rootVariables).toContain('place')
  })

  it('extracts variables from multiline templates', () => {
    const result = extract(`
      Line 1: {{var1}}
      Line 2: {{var2}}
      Line 3: {{var3}}
    `)
    expect(result.rootVariables).toEqual(['var1', 'var2', 'var3'])
  })

  it('handles empty template', () => {
    const result = extract('')
    expect(result.rootVariables).toEqual([])
    expect(result.variables).toEqual([])
  })

  it('handles template with no variables', () => {
    const result = extract('Just plain text')
    expect(result.rootVariables).toEqual([])
    expect(result.variables).toEqual([])
  })

  it('extracts from unescaped output {{{triple}}}', () => {
    const result = extract('{{{rawVar}}}')
    expect(result.rootVariables).toEqual(['rawVar'])
  })

  it('deduplicates repeated variables', () => {
    const result = extract('{{name}} and {{name}} again')
    expect(result.rootVariables).toEqual(['name'])
    expect(result.variables).toHaveLength(1)
  })
})

// =============================================================================
// EXTRACT: Nested/Path Variables
// =============================================================================

describe('extract: nested/path variables', () => {
  it('extracts two-level nested path', () => {
    const result = extract('{{user.name}}')
    expect(result.rootVariables).toEqual(['user'])
    expect(result.variables[0]).toMatchObject({
      name: 'user',
      path: 'user.name',
      type: 'nested',
    })
  })

  it('extracts three-level nested path', () => {
    const result = extract('{{company.address.city}}')
    expect(result.variables[0].path).toBe('company.address.city')
  })

  it('extracts deeply nested path (5+ levels)', () => {
    const result = extract('{{a.b.c.d.e.f}}')
    expect(result.variables[0].path).toBe('a.b.c.d.e.f')
    expect(result.rootVariables).toEqual(['a'])
  })

  it('extracts multiple different nested paths from same root', () => {
    const result = extract('{{user.name}} {{user.email}} {{user.age}}')
    const paths = result.variables.map(v => v.path)
    expect(paths).toContain('user.name')
    expect(paths).toContain('user.email')
    expect(paths).toContain('user.age')
    expect(result.rootVariables).toEqual(['user'])
  })

  it('extracts mixed simple and nested variables', () => {
    const result = extract('{{title}} by {{author.name}}')
    expect(result.rootVariables).toContain('title')
    expect(result.rootVariables).toContain('author')
  })

  it('handles path starting with this', () => {
    const result = extract('{{this.name}}')
    // 'this' is a built-in, should not be extracted as a variable
    expect(result.rootVariables).not.toContain('this')
  })
})

// =============================================================================
// EXTRACT: Block Helpers (#if, #unless)
// =============================================================================

describe('extract: block helpers (non-context-changing)', () => {
  it('extracts condition from #if', () => {
    const result = extract('{{#if active}}content{{/if}}')
    expect(result.rootVariables).toContain('active')
    expect(result.variables.find(v => v.path === 'active')).toMatchObject({
      type: 'block',
      blockType: 'if',
    })
  })

  it('extracts nested path condition from #if', () => {
    const result = extract('{{#if user.isActive}}content{{/if}}')
    expect(result.variables[0].path).toBe('user.isActive')
    expect(result.rootVariables).toEqual(['user'])
  })

  it('extracts condition from #unless', () => {
    const result = extract('{{#unless disabled}}content{{/unless}}')
    expect(result.rootVariables).toContain('disabled')
    expect(result.variables.find(v => v.path === 'disabled')?.blockType).toBe('unless')
  })

  it('extracts variables inside #if block (context unchanged)', () => {
    const result = extract('{{#if show}}{{message}}{{/if}}')
    expect(result.rootVariables).toContain('show')
    expect(result.rootVariables).toContain('message')
  })

  it('extracts variables from both if and else branches', () => {
    const result = extract('{{#if cond}}{{trueVar}}{{else}}{{falseVar}}{{/if}}')
    expect(result.rootVariables).toContain('cond')
    expect(result.rootVariables).toContain('trueVar')
    expect(result.rootVariables).toContain('falseVar')
  })

  it('handles nested #if blocks', () => {
    const result = extract('{{#if a}}{{#if b}}{{c}}{{/if}}{{/if}}')
    expect(result.rootVariables).toContain('a')
    expect(result.rootVariables).toContain('b')
    expect(result.rootVariables).toContain('c')
  })
})

// =============================================================================
// EXTRACT: Context-Changing Blocks (#each, #with)
// =============================================================================

describe('extract: #each blocks', () => {
  it('extracts collection variable from #each', () => {
    const result = extract('{{#each items}}{{/each}}')
    expect(result.rootVariables).toEqual(['items'])
    expect(result.variables[0]).toMatchObject({
      type: 'block',
      blockType: 'each',
    })
  })

  it('extracts nested path collection from #each', () => {
    const result = extract('{{#each order.items}}{{/each}}')
    expect(result.variables[0].path).toBe('order.items')
  })

  it('prefixes inner variables with items[] for #each', () => {
    const result = extract('{{#each items}}{{name}}{{/each}}')
    expect(result.variables.map(v => v.path)).toContain('items[].name')
    expect(result.rootVariables).not.toContain('name')
  })

  it('tracks context for variables inside #each', () => {
    const result = extract('{{#each items}}{{name}}{{/each}}')
    const innerVar = result.variables.find(v => v.path === 'items[].name')
    expect(innerVar?.context).toBe('items')
  })

  it('handles multiple variables inside #each', () => {
    const result = extract('{{#each products}}{{name}}{{price}}{{quantity}}{{/each}}')
    const paths = result.variables.map(v => v.path)
    expect(paths).toContain('products[].name')
    expect(paths).toContain('products[].price')
    expect(paths).toContain('products[].quantity')
  })

  it('handles nested paths inside #each', () => {
    const result = extract('{{#each users}}{{profile.avatar}}{{/each}}')
    expect(result.variables.map(v => v.path)).toContain('users[].profile.avatar')
  })
})

describe('extract: #with blocks', () => {
  it('extracts object variable from #with', () => {
    const result = extract('{{#with user}}{{/with}}')
    expect(result.rootVariables).toEqual(['user'])
    expect(result.variables[0]).toMatchObject({
      type: 'block',
      blockType: 'with',
    })
  })

  it('prefixes inner variables with object path for #with', () => {
    const result = extract('{{#with user}}{{name}}{{/with}}')
    expect(result.variables.map(v => v.path)).toContain('user.name')
  })

  it('tracks context for variables inside #with', () => {
    const result = extract('{{#with user}}{{email}}{{/with}}')
    const innerVar = result.variables.find(v => v.path === 'user.email')
    expect(innerVar?.context).toBe('user')
  })

  it('handles nested paths inside #with', () => {
    const result = extract('{{#with company}}{{address.city}}{{/with}}')
    expect(result.variables.map(v => v.path)).toContain('company.address.city')
  })
})

describe('extract: nested context blocks', () => {
  it('handles #each inside #each', () => {
    const result = extract('{{#each orders}}{{#each items}}{{name}}{{/each}}{{/each}}')
    expect(result.variables.map(v => v.path)).toContain('orders[].items[].name')
  })

  it('handles #with inside #each', () => {
    const result = extract('{{#each users}}{{#with profile}}{{bio}}{{/with}}{{/each}}')
    expect(result.variables.map(v => v.path)).toContain('users[].profile.bio')
  })

  it('handles #each inside #with', () => {
    const result = extract('{{#with company}}{{#each employees}}{{name}}{{/each}}{{/with}}')
    expect(result.variables.map(v => v.path)).toContain('company.employees[].name')
  })

  it('handles triple nested #each', () => {
    const result = extract(`
      {{#each companies}}
        {{#each departments}}
          {{#each employees}}
            {{name}}
          {{/each}}
        {{/each}}
      {{/each}}
    `)
    expect(result.variables.map(v => v.path)).toContain('companies[].departments[].employees[].name')
  })

  it('handles #if inside #each (if does not change context)', () => {
    const result = extract('{{#each items}}{{#if active}}{{name}}{{/if}}{{/each}}')
    expect(result.variables.map(v => v.path)).toContain('items[].name')
    expect(result.variables.map(v => v.path)).toContain('items[].active')
  })
})

// =============================================================================
// EXTRACT: Custom Helpers
// =============================================================================

describe('extract: custom helpers', () => {
  it('extracts argument but not helper name for single-arg helper', () => {
    const result = extract('{{formatDate createdAt}}')
    expect(result.rootVariables).toContain('createdAt')
    expect(result.rootVariables).not.toContain('formatDate')
  })

  it('extracts all arguments for multi-arg helper', () => {
    const result = extract('{{concat first last}}')
    expect(result.rootVariables).toContain('first')
    expect(result.rootVariables).toContain('last')
    expect(result.rootVariables).not.toContain('concat')
  })

  it('extracts nested path arguments', () => {
    const result = extract('{{format user.createdAt}}')
    expect(result.variables[0].path).toBe('user.createdAt')
  })

  it('extracts multiple nested path arguments', () => {
    const result = extract('{{compare order.total order.minimum}}')
    const paths = result.variables.map(v => v.path)
    expect(paths).toContain('order.total')
    expect(paths).toContain('order.minimum')
  })

  it('handles helper with path as name', () => {
    const result = extract('{{helpers.format value}}')
    expect(result.rootVariables).toContain('value')
    // helpers.format is the helper, not a variable
  })

  it('extracts arguments inside context blocks', () => {
    const result = extract('{{#each items}}{{format createdAt}}{{/each}}')
    expect(result.variables.map(v => v.path)).toContain('items[].createdAt')
  })
})

// =============================================================================
// EXTRACT: Built-in Helpers and Special Cases
// =============================================================================

describe('extract: built-in helpers', () => {
  it('does not extract built-in helper names', () => {
    const builtIns = ['if', 'unless', 'each', 'with', 'lookup', 'log']
    for (const name of builtIns) {
      const result = extract(`{{${name}}}`)
      expect(result.rootVariables).not.toContain(name)
    }
  })

  it('handles lookup helper', () => {
    const result = extract('{{lookup items index}}')
    expect(result.rootVariables).toContain('items')
    expect(result.rootVariables).toContain('index')
    expect(result.rootVariables).not.toContain('lookup')
  })

  it('handles log helper (extracts arguments)', () => {
    const result = extract('{{log message}}')
    expect(result.rootVariables).toContain('message')
    expect(result.rootVariables).not.toContain('log')
  })
})

describe('extract: data variables (@)', () => {
  it('ignores @index', () => {
    const result = extract('{{@index}}')
    expect(result.rootVariables).toHaveLength(0)
  })

  it('ignores @key', () => {
    const result = extract('{{@key}}')
    expect(result.rootVariables).toHaveLength(0)
  })

  it('ignores @first and @last', () => {
    const result = extract('{{@first}} {{@last}}')
    expect(result.rootVariables).toHaveLength(0)
  })

  it('ignores @root', () => {
    const result = extract('{{@root.name}}')
    expect(result.rootVariables).toHaveLength(0)
  })

  it('ignores data variables mixed with regular variables', () => {
    const result = extract('{{name}} {{@index}} {{value}}')
    expect(result.rootVariables).toEqual(['name', 'value'])
  })
})

// =============================================================================
// EXTRACT: Error Recovery and Edge Cases
// =============================================================================

describe('extract: error recovery', () => {
  it('extracts from partially valid template (unclosed block)', () => {
    const result = extract('{{#if show {{name}}')
    expect(result.rootVariables).toContain('name')
  })

  it('extracts from template with syntax error then valid expression', () => {
    const result = extract('{{broken {{valid}}')
    expect(result.rootVariables).toContain('valid')
  })

  it('handles multiple errors in template', () => {
    const result = extract('{{bad1 {{good1}} {{bad2 {{good2}}')
    expect(result.rootVariables).toContain('good1')
    expect(result.rootVariables).toContain('good2')
  })

  it('handles unclosed braces at end', () => {
    const result = extract('{{name}} {{incomplete')
    expect(result.rootVariables).toContain('name')
  })

  it('handles empty expressions', () => {
    const result = extract('{{}}')
    expect(result.rootVariables).toEqual([])
  })

  it('handles whitespace-only expressions', () => {
    const result = extract('{{   }}')
    expect(result.rootVariables).toEqual([])
  })
})

// =============================================================================
// EXTRACT: Comments and Partials
// =============================================================================

describe('extract: comments', () => {
  it('ignores single-line comments', () => {
    const result = extract('{{! this is a comment }}')
    expect(result.rootVariables).toEqual([])
  })

  it('ignores block comments', () => {
    const result = extract('{{!-- this is a block comment --}}')
    expect(result.rootVariables).toEqual([])
  })

  it('extracts variables around comments', () => {
    const result = extract('{{before}} {{! comment }} {{after}}')
    expect(result.rootVariables).toContain('before')
    expect(result.rootVariables).toContain('after')
  })
})

describe('extract: partials', () => {
  it('ignores partial references', () => {
    const result = extract('{{> header}}')
    expect(result.rootVariables).not.toContain('header')
  })

  it('extracts context passed to partial', () => {
    const result = extract('{{> userCard user}}')
    expect(result.rootVariables).toContain('user')
  })
})

// =============================================================================
// EXTRACT: Hash Parameters
// =============================================================================

describe('extract: hash parameters', () => {
  it('extracts variable values in hash params', () => {
    const result = extract('{{helper key=value}}')
    expect(result.rootVariables).toContain('value')
    expect(result.rootVariables).not.toContain('key')
  })

  it('extracts multiple hash param values', () => {
    const result = extract('{{helper a=first b=second}}')
    expect(result.rootVariables).toContain('first')
    expect(result.rootVariables).toContain('second')
  })

  it('extracts nested paths in hash values', () => {
    const result = extract('{{helper data=user.profile}}')
    expect(result.variables.map(v => v.path)).toContain('user.profile')
  })

  it('handles mix of positional and hash args', () => {
    const result = extract('{{helper arg1 key=arg2}}')
    expect(result.rootVariables).toContain('arg1')
    expect(result.rootVariables).toContain('arg2')
  })
})

// =============================================================================
// EXTRACT: Subexpressions
// =============================================================================

describe('extract: subexpressions', () => {
  it('extracts variables from subexpressions', () => {
    const result = extract('{{outer (inner value)}}')
    expect(result.rootVariables).toContain('value')
    expect(result.rootVariables).not.toContain('outer')
    expect(result.rootVariables).not.toContain('inner')
  })

  it('extracts from nested subexpressions', () => {
    const result = extract('{{a (b (c deepValue))}}')
    expect(result.rootVariables).toContain('deepValue')
  })

  it('extracts from subexpression in helper argument position', () => {
    const result = extract('{{#if (eq status "active")}}{{name}}{{/if}}')
    expect(result.rootVariables).toContain('status')
    expect(result.rootVariables).toContain('name')
    expect(result.rootVariables).not.toContain('eq')
  })
})

// =============================================================================
// EXTRACT: Block Parameters
// =============================================================================

describe('extract: block parameters', () => {
  it('handles #each with as |item|', () => {
    const result = extract('{{#each items as |item|}}{{item.name}}{{/each}}')
    expect(result.rootVariables).toContain('items')
    // Block param 'item' should not be extracted as a root variable
    expect(result.rootVariables).not.toContain('item')
  })

  it('handles #each with as |item index|', () => {
    const result = extract('{{#each items as |item idx|}}{{item}}{{/each}}')
    expect(result.rootVariables).toContain('items')
    expect(result.rootVariables).not.toContain('item')
    expect(result.rootVariables).not.toContain('idx')
  })
})

// =============================================================================
// INTERPOLATE: Basic Functionality
// =============================================================================

describe('interpolate: basic', () => {
  it('interpolates simple variable', () => {
    expect(interpolate('{{name}}', { name: 'World' })).toBe('World')
  })

  it('interpolates multiple variables', () => {
    expect(interpolate('{{a}} {{b}}', { a: 'Hello', b: 'World' })).toBe('Hello World')
  })

  it('interpolates with surrounding text', () => {
    expect(interpolate('Hello, {{name}}!', { name: 'Alice' })).toBe('Hello, Alice!')
  })

  it('handles missing variables (empty string)', () => {
    expect(interpolate('{{missing}}', {})).toBe('')
  })

  it('returns content unchanged when no variables provided', () => {
    expect(interpolate('Hello {{name}}!')).toBe('Hello {{name}}!')
  })

  it('handles empty template', () => {
    expect(interpolate('', { name: 'test' })).toBe('')
  })
})

describe('interpolate: nested variables', () => {
  it('interpolates two-level path', () => {
    expect(interpolate('{{user.name}}', { user: { name: 'John' } })).toBe('John')
  })

  it('interpolates deeply nested path', () => {
    const data = { a: { b: { c: { d: 'deep' } } } }
    expect(interpolate('{{a.b.c.d}}', data)).toBe('deep')
  })

  it('handles missing nested property', () => {
    expect(interpolate('{{user.missing}}', { user: {} })).toBe('')
  })
})

// =============================================================================
// INTERPOLATE: Block Helpers
// =============================================================================

describe('interpolate: #if', () => {
  it('renders content when truthy', () => {
    expect(interpolate('{{#if show}}yes{{/if}}', { show: true })).toBe('yes')
  })

  it('hides content when falsy', () => {
    expect(interpolate('{{#if show}}yes{{/if}}', { show: false })).toBe('')
  })

  it('handles else branch', () => {
    expect(interpolate('{{#if show}}yes{{else}}no{{/if}}', { show: false })).toBe('no')
  })

  it('treats empty array as falsy', () => {
    expect(interpolate('{{#if items}}has{{/if}}', { items: [] })).toBe('')
  })

  it('treats non-empty array as truthy', () => {
    expect(interpolate('{{#if items}}has{{/if}}', { items: [1] })).toBe('has')
  })
})

describe('interpolate: #unless', () => {
  it('renders content when falsy', () => {
    expect(interpolate('{{#unless hide}}shown{{/unless}}', { hide: false })).toBe('shown')
  })

  it('hides content when truthy', () => {
    expect(interpolate('{{#unless hide}}shown{{/unless}}', { hide: true })).toBe('')
  })
})

describe('interpolate: #each', () => {
  it('iterates over array', () => {
    expect(interpolate('{{#each items}}{{this}}{{/each}}', { items: ['a', 'b'] })).toBe('ab')
  })

  it('accesses object properties in each', () => {
    const data = { items: [{ n: 'x' }, { n: 'y' }] }
    expect(interpolate('{{#each items}}{{n}}{{/each}}', data)).toBe('xy')
  })

  it('handles @index', () => {
    expect(interpolate('{{#each items}}{{@index}}{{/each}}', { items: ['a', 'b'] })).toBe('01')
  })

  it('handles @first and @last', () => {
    const tpl = '{{#each items}}{{#if @first}}F{{/if}}{{#if @last}}L{{/if}}{{/each}}'
    expect(interpolate(tpl, { items: ['a', 'b', 'c'] })).toBe('FL')
  })

  it('handles empty array', () => {
    expect(interpolate('{{#each items}}x{{/each}}', { items: [] })).toBe('')
  })

  it('handles else for empty array', () => {
    expect(interpolate('{{#each items}}x{{else}}empty{{/each}}', { items: [] })).toBe('empty')
  })
})

describe('interpolate: #with', () => {
  it('changes context', () => {
    expect(interpolate('{{#with user}}{{name}}{{/with}}', { user: { name: 'Jo' } })).toBe('Jo')
  })

  it('handles falsy context', () => {
    expect(interpolate('{{#with user}}{{name}}{{/with}}', { user: null })).toBe('')
  })
})

// =============================================================================
// INTERPOLATE: HTML Escaping
// =============================================================================

describe('interpolate: HTML escaping', () => {
  it('escapes HTML by default', () => {
    const result = interpolate('{{html}}', { html: '<script>alert("xss")</script>' })
    expect(result).not.toContain('<script>')
    expect(result).toContain('&lt;script&gt;')
  })

  it('allows raw HTML with triple braces', () => {
    expect(interpolate('{{{html}}}', { html: '<b>bold</b>' })).toBe('<b>bold</b>')
  })

  it('escapes ampersands', () => {
    expect(interpolate('{{text}}', { text: 'A & B' })).toBe('A &amp; B')
  })

  it('escapes quotes', () => {
    expect(interpolate('{{text}}', { text: '"quoted"' })).toContain('&quot;')
  })
})

// =============================================================================
// INTERPOLATE: Custom Helpers
// =============================================================================

describe('interpolate: custom helpers', () => {
  it('uses custom helper', () => {
    const result = interpolate(
      '{{upper name}}',
      { name: 'hello' },
      { helpers: { upper: (s) => (s as string).toUpperCase() } }
    )
    expect(result).toBe('HELLO')
  })

  it('supports multiple custom helpers', () => {
    const helpers = {
      double: (n: unknown) => (n as number) * 2,
      inc: (n: unknown) => (n as number) + 1,
    }
    expect(interpolate('{{double (inc num)}}', { num: 5 }, { helpers })).toBe('12')
  })

  it('passes multiple arguments to helper', () => {
    const helpers = {
      add: (a: unknown, b: unknown) => (a as number) + (b as number),
    }
    expect(interpolate('{{add x y}}', { x: 3, y: 4 }, { helpers })).toBe('7')
  })

  it('helper receives hash parameters', () => {
    const helpers = {
      greet: (name: unknown, opts: { hash: { greeting: string } }) =>
        `${opts.hash.greeting} ${name}`,
    }
    expect(interpolate('{{greet name greeting="Hi"}}', { name: 'Jo' }, { helpers })).toBe('Hi Jo')
  })
})

// =============================================================================
// INTERPOLATE: Literals
// =============================================================================

describe('interpolate: literals', () => {
  it('handles string literals', () => {
    const helpers = { echo: (s: unknown) => s }
    expect(interpolate('{{echo "hello"}}', {}, { helpers })).toBe('hello')
  })

  it('handles number literals', () => {
    const helpers = { echo: (n: unknown) => n }
    expect(interpolate('{{echo 42}}', {}, { helpers })).toBe('42')
  })

  it('handles boolean true', () => {
    expect(interpolate('{{#if true}}yes{{/if}}', {})).toBe('yes')
  })

  it('handles boolean false', () => {
    expect(interpolate('{{#if false}}yes{{/if}}', {})).toBe('')
  })
})
