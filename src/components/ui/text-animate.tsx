import { useEffect, useRef, useState, type ReactNode } from 'react'
import { c } from '../../lib'

// Blur-in-up text reveal, adapted from magicui's <TextAnimate animation="blurInUp"
// by="character" once />. Upstream uses motion/react; this app has no animation
// library, so the stagger is plain CSS (per-character animation-delay) and the
// "once" behaviour comes from an IntersectionObserver that unobserves on entry.
//
// `by="element"` animates the whole node as one unit. That mode exists because
// gradient headings (.aurora-text) paint via background-clip:text, and ANY child
// that creates a stacking context — transform, filter, will-change — makes the
// clipped text render blank in Chrome (verified: opacity alone is safe, the other
// three are not). Splitting such a heading into animated characters would erase
// it, so gradient text animates as one element instead.
//
// Accessibility: animated characters are aria-hidden and the full string is
// exposed to screen readers in one node, so assistive tech never reads text
// letter-by-letter. Honors prefers-reduced-motion by rendering the text plainly.
interface Props {
  children: ReactNode
  by?: 'character' | 'word' | 'element'
  className?: string
  /** Seconds between each character/word. */
  stagger?: number
  /** Seconds before the first character starts. */
  delay?: number
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function TextAnimate({
  children,
  by = 'character',
  className = '',
  stagger = 0.03,
  delay = 0,
}: Props) {
  const ref = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(true)
      return
    }
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true)
            io.unobserve(entry.target) // `once`
          }
        }
      },
      { threshold: 0.15 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  if (prefersReducedMotion()) {
    return <span className={className}>{children}</span>
  }

  // Splitting needs a plain string; anything else (or an explicit element
  // request) animates as a single unit.
  if (by === 'element' || typeof children !== 'string') {
    return (
      <span
        ref={ref}
        className={c(className, 'text-animate-part', shown && 'text-animate-in')}
        style={{ animationDelay: `${delay}s` }}
      >
        {children}
      </span>
    )
  }

  const parts = by === 'word' ? children.split(/(\s+)/) : Array.from(children)

  return (
    <span ref={ref} className={className}>
      <span aria-hidden="true">
        {parts.map((part, i) =>
          /^\s+$/.test(part) ? (
            part
          ) : (
            <span
              key={i}
              className={shown ? 'text-animate-part text-animate-in' : 'text-animate-part'}
              style={{ animationDelay: `${delay + i * stagger}s` }}
            >
              {part}
            </span>
          ),
        )}
      </span>
      {/* Screen readers get the whole string, never per-character. */}
      <span className="sr-only-text">{children}</span>
    </span>
  )
}
