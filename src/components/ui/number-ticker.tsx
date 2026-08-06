import { useEffect, useRef, useState } from 'react'

// Count-up number, adapted from magicui's <NumberTicker />. Upstream animates a
// motion/react spring; this app has no animation library, so the ramp is a
// requestAnimationFrame ease-out — visually equivalent for stat counters.
//
// Re-animates whenever `value` changes (stat cards refetch after a provision),
// counting from whatever was on screen so the number never jumps backwards to 0.
interface Props {
  value: number
  /** Animation length in ms. */
  duration?: number
  /** Where the first count-up starts. */
  startValue?: number
  className?: string
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

export default function NumberTicker({
  value, duration = 900, startValue = 0, className = '',
}: Props) {
  // Starts at `startValue`, not `value`: these tickers mount only once their
  // data has loaded (the card shows a skeleton until then), so seeding with the
  // final number would mean from === value and no count-up would ever run.
  const [display, setDisplay] = useState(startValue)
  const fromRef = useRef(startValue)
  const displayRef = useRef(startValue)
  const frameRef = useRef<number | undefined>(undefined)

  const show = (n: number) => {
    displayRef.current = n
    setDisplay(n)
  }

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const from = fromRef.current
    if (reduced || from === value) {
      fromRef.current = value
      show(value)
      return
    }

    let start: number | undefined
    const step = (ts: number) => {
      if (start === undefined) start = ts
      const t = Math.min((ts - start) / duration, 1)
      show(Math.round(from + (value - from) * easeOut(t)))
      if (t < 1) frameRef.current = requestAnimationFrame(step)
      else fromRef.current = value
    }
    frameRef.current = requestAnimationFrame(step)
    return () => {
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current)
      // Resume from whatever is on screen, NOT the target: React StrictMode
      // runs mount → cleanup → mount in dev, and parking the ref on `value`
      // would make the second run a no-op and skip the count-up entirely.
      fromRef.current = displayRef.current
    }
  }, [value, duration])

  return (
    <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {display.toLocaleString()}
    </span>
  )
}
