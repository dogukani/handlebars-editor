import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HandlebarsEditor } from '../../src/components/Editor'

describe('HandlebarsEditor', () => {
  it('renders with value', () => {
    render(<HandlebarsEditor value="Hello {{name}}" />)
    const textarea = screen.getByRole('combobox')
    expect(textarea).toHaveValue('Hello {{name}}')
  })

  it('calls onChange when value changes', () => {
    const onChange = vi.fn()
    render(<HandlebarsEditor value="" onChange={onChange} />)

    const textarea = screen.getByRole('combobox')
    fireEvent.change(textarea, { target: { value: 'test' } })

    expect(onChange).toHaveBeenCalledWith('test')
  })

  it('shows placeholder when empty', () => {
    const { container } = render(<HandlebarsEditor value="" placeholder="Enter text" />)

    const highlight = container.querySelector('.hbs-editor-highlight')
    expect(highlight?.innerHTML).toContain('Enter text')
  })

  it('applies readonly state', () => {
    render(<HandlebarsEditor value="test" readOnly />)

    const textarea = screen.getByRole('combobox')
    expect(textarea).toHaveAttribute('readonly')
  })

  it('applies custom className', () => {
    const { container } = render(<HandlebarsEditor value="" className="custom-class" />)

    expect(container.firstChild).toHaveClass('hbs-editor')
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('applies theme colors via CSS variables', () => {
    const { container } = render(<HandlebarsEditor value="" theme={{ variable: '#ff0000' }} />)

    const editor = container.firstChild as HTMLElement
    expect(editor.style.getPropertyValue('--hbs-color-variable')).toBe('#ff0000')
  })

  it('applies minHeight style', () => {
    const { container } = render(<HandlebarsEditor value="" minHeight={200} />)

    const editor = container.firstChild as HTMLElement
    expect(editor.style.minHeight).toBe('200px')
  })

  it('renders syntax highlighting spans', () => {
    const { container } = render(<HandlebarsEditor value="{{name}}" />)

    const highlight = container.querySelector('.hbs-editor-highlight')
    expect(highlight?.querySelector('.hbs-token-brace')).toBeInTheDocument()
    expect(highlight?.querySelector('.hbs-token-variable')).toBeInTheDocument()
  })

  it('has correct accessibility attributes', () => {
    render(<HandlebarsEditor value="" />)

    const combobox = screen.getByRole('combobox')
    expect(combobox).toHaveAttribute('aria-haspopup', 'listbox')
    expect(combobox).toHaveAttribute('aria-expanded', 'false')
    expect(combobox).toHaveAttribute('aria-controls')
  })

  describe('syntax highlighting classes', () => {
    it('renders this keyword with data-var class', () => {
      const { container } = render(<HandlebarsEditor value="{{this}}" />)
      const highlight = container.querySelector('.hbs-editor-highlight')
      const dataVarSpan = highlight?.querySelector('.hbs-token-data-var')
      expect(dataVarSpan).toBeInTheDocument()
      expect(dataVarSpan?.textContent).toBe('this')
    })

    it('renders nested path with variable and variable-path classes', () => {
      const { container } = render(<HandlebarsEditor value="{{user.name}}" />)
      const highlight = container.querySelector('.hbs-editor-highlight')
      expect(highlight?.querySelector('.hbs-token-variable')).toBeInTheDocument()
      expect(highlight?.querySelector('.hbs-token-variable-path')).toBeInTheDocument()
    })

    it('renders block helper argument with helper-arg class', () => {
      const { container } = render(<HandlebarsEditor value="{{#each items}}" />)
      const highlight = container.querySelector('.hbs-editor-highlight')
      const helperArg = highlight?.querySelector('.hbs-token-helper-arg')
      expect(helperArg).toBeInTheDocument()
      expect(helperArg?.textContent).toBe('items')
    })

    it('renders helper with helper class', () => {
      const { container } = render(<HandlebarsEditor value="{{formatDate date}}" />)
      const highlight = container.querySelector('.hbs-editor-highlight')
      const helper = highlight?.querySelector('.hbs-token-helper')
      expect(helper).toBeInTheDocument()
      expect(helper?.textContent).toBe('formatDate')
    })
  })
})
