import { useEffect, useRef } from 'react'

interface Props {
  duration?: number  // seconds for one full rotation
  size?: number      // beam arc length in px
  colorFrom?: string
  colorTo?: string
}

export default function BorderBeam({
  duration = 6,
  size = 120,
  colorFrom = '#4F46E5',
  colorTo = '#10B981',
}: Props) {
  const beamRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = beamRef.current
    if (!el) return
    el.style.setProperty('--beam-duration', `${duration}s`)
    el.style.setProperty('--beam-size', `${size}px`)
    el.style.setProperty('--beam-from', colorFrom)
    el.style.setProperty('--beam-to', colorTo)
  }, [duration, size, colorFrom, colorTo])

  return (
    <span
      ref={beamRef}
      aria-hidden
      className="border-beam-root"
    />
  )
}
