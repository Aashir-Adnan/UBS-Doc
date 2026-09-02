import type { ReactNode } from 'react'
import { Highlight, themes } from 'prism-react-renderer'
import { useTheme } from '../../app/ThemeContext'

// MDX renders fenced blocks as <pre><code className="language-x">…</code></pre>.
// We intercept `pre` (not `code`) so inline code keeps its plain styling, and
// pull the language + source text out of the single child code element.
type CodeProps = { className?: string; children?: ReactNode }

function textOf(children: ReactNode): string {
  if (typeof children === 'string') return children
  if (Array.isArray(children)) return children.map(textOf).join('')
  if (children && typeof children === 'object' && 'props' in (children as any))
    return textOf((children as any).props?.children)
  return ''
}

export function MDXPre({ children }: { children?: ReactNode }) {
  const { theme } = useTheme()
  const child = children as { props?: CodeProps } | undefined
  const props = child?.props

  // Not a fenced code block (bare <pre>) — render it untouched.
  if (!props || typeof props !== 'object') return <pre>{children}</pre>

  const language = /language-(\w+)/.exec(props.className || '')?.[1] || 'text'
  const code = textOf(props.children).replace(/\n$/, '')

  return (
    <Highlight code={code} language={language} theme={theme === 'dark' ? themes.dracula : themes.github}>
      {({ style, tokens, getLineProps, getTokenProps }) => (
        <pre className="docs-code" style={style}>
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })}>
              {line.map((token, k) => <span key={k} {...getTokenProps({ token })} />)}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  )
}

// Inline code passes straight through; docs.css styles it.
export function MDXCode(props: CodeProps) {
  return <code {...props} />
}

export const MDX_COMPONENTS = { pre: MDXPre, code: MDXCode }
