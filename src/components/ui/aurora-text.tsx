import TextAnimate from './text-animate'

interface Props {
  children: React.ReactNode
  className?: string
  /** Set false to render the gradient without the blur-in reveal. */
  animate?: boolean
}

export default function AuroraText({ children, className = '', animate = true }: Props) {
  const gradient = <span className={`aurora-text ${className}`}>{children}</span>
  if (!animate) return gradient
  // The animated wrapper must be the ANCESTOR of .aurora-text: a transform or
  // filter on a *child* of a background-clip:text element blanks the text in
  // Chrome, while the same properties on an ancestor blur the whole rendered
  // layer with the gradient intact. See the note in text-animate.tsx.
  return <TextAnimate by="element">{gradient}</TextAnimate>
}
