# handlebars-editor-react

[![npm version](https://img.shields.io/npm/v/handlebars-editor-react.svg)](https://www.npmjs.com/package/handlebars-editor-react)
[![license](https://img.shields.io/npm/l/handlebars-editor-react.svg)](https://github.com/dogukani/handlebars-editor/blob/main/LICENSE)
[![downloads](https://img.shields.io/npm/dm/handlebars-editor-react.svg)](https://www.npmjs.com/package/handlebars-editor-react)

A React component for editing Handlebars templates with syntax highlighting and autocomplete.

**[Live Demo](https://dogukani.github.io/handlebars-editor)**

## Features

- Syntax highlighting for all Handlebars constructs
- Autocomplete for block helpers and variables
- Customizable theming via CSS variables
- TypeScript support
- Zero dependencies (except React and Handlebars)

## Installation

```bash
npm install handlebars-editor-react
```

## Usage

```tsx
import { HandlebarsEditor } from 'handlebars-editor-react';
import 'handlebars-editor-react/styles.css';

function App() {
  const [template, setTemplate] = useState('Hello {{name}}!');

  return (
    <HandlebarsEditor
      value={template}
      onChange={setTemplate}
      placeholder="Enter your template..."
    />
  );
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | required | The template content |
| `onChange` | `(value: string) => void` | - | Called when content changes |
| `placeholder` | `string` | `"Enter template..."` | Placeholder text |
| `readOnly` | `boolean` | `false` | Disable editing |
| `className` | `string` | `""` | Additional CSS class |
| `style` | `CSSProperties` | - | Inline styles |
| `theme` | `Partial<ThemeColors>` | - | Custom colors |
| `customHelpers` | `string[]` | `[]` | Additional helpers for autocomplete |
| `autocomplete` | `boolean` | `true` | Enable autocomplete |
| `minHeight` | `string \| number` | `100` | Minimum editor height |

## Theming

Customize colors using CSS variables or the `theme` prop:

```css
.hbs-editor {
  --hbs-color-variable: #3b82f6;
  --hbs-color-helper: #f59e0b;
  --hbs-color-block-keyword: #a855f7;
  --hbs-color-literal: #16a34a;
  --hbs-color-comment: #9ca3af;
}
```

Or via props:

```tsx
<HandlebarsEditor
  value={template}
  theme={{
    variable: '#3b82f6',
    helper: '#f59e0b',
    blockKeyword: '#a855f7',
  }}
/>
```

### Available Theme Colors

- `variable` - Simple variables `{{name}}`
- `variablePath` - Nested paths `{{person.name}}`
- `blockKeyword` - Block keywords `#if`, `/each`, `else`
- `blockParam` - Block parameters
- `helper` - Helper names `{{uppercase name}}`
- `helperArg` - Helper arguments
- `hashKey` - Hash keys `key=`
- `hashValue` - Hash values
- `literal` - Strings, numbers, booleans
- `dataVar` - Data variables `@index`, `@key`
- `subexprParen` - Subexpression parentheses
- `comment` - Comments
- `raw` - Raw output `{{{raw}}}`
- `brace` - Braces `{{` and `}}`
- `text` - Default text color
- `background` - Editor background
- `caret` - Cursor color
- `border` - Border color
- `placeholder` - Placeholder text color

### Dark Theme

Add the `hbs-theme-dark` class to enable dark mode:

```tsx
<HandlebarsEditor
  value={template}
  className="hbs-theme-dark"
/>
```

## Utility Functions

The package also exports utility functions for working with Handlebars templates:

```tsx
import { extract, tokenize, interpolate } from 'handlebars-editor-react';

// Extract variables from template
const result = extract('Hello {{name}}, you have {{count}} messages');
console.log(result.rootVariables); // ['name', 'count']

// Tokenize for custom rendering
const tokens = tokenize('{{#if show}}content{{/if}}');

// Interpolate template with data
const output = interpolate('Hello {{name}}!', { name: 'World' });
```

## Supported Handlebars Syntax

- Simple variables: `{{name}}`
- Nested paths: `{{person.name}}`
- Block helpers: `{{#if}}`, `{{#each}}`, `{{#with}}`, `{{#unless}}`
- Else blocks: `{{else}}`
- Helpers with arguments: `{{link text url}}`
- Hash arguments: `{{link "text" href=url}}`
- Subexpressions: `{{helper (inner arg)}}`
- Raw output: `{{{unescaped}}}`
- Comments: `{{! comment }}` and `{{!-- block comment --}}`
- Data variables: `@index`, `@key`, `@first`, `@last`
- Parent context: `../`
- Whitespace control: `{{~trim~}}`

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Run tests
pnpm test

# Build
pnpm build
```

## License

MIT - see [LICENSE](LICENSE) for details.
