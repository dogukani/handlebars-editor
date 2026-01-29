import { tokenize } from '../core/parser'

interface HandlebarsHighlightProps {
  content: string
  className?: string
}

/**
 * Lightweight inline syntax highlighting for Handlebars content.
 * Renders colored spans without any wrapper - embed within your own containers.
 */
export function HandlebarsHighlight({ content, className }: HandlebarsHighlightProps) {
  if (!content) return null

  const tokens = tokenize(content)

  return (
    <span className={className}>
      {tokens.map((token) => (
        <span key={token.start} className={`hbs-token-${token.type}`}>
          {token.value}
        </span>
      ))}
    </span>
  )
}
