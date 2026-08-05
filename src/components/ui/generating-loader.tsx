// Animated "Generating" loader for AI-generation waits (pre-meeting notes,
// analysis, tasks, report). Adapted from a styled-components snippet to the
// app's plain-CSS design system (styles in design.css under .gen-loader);
// letters get their stagger via inline animation-delay so any label works.
interface Props {
  label?: string
  className?: string
}

export default function GeneratingLoader({ label = 'Generating', className = '' }: Props) {
  return (
    <div className={`gen-loader ${className}`.trim()} role="status" aria-label={label}>
      {label.split('').map((ch, i) => (
        <span key={i} className="gen-loader-letter" style={{ animationDelay: `${i * 0.1}s` }}>
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
      <div className="gen-loader-ring" />
    </div>
  )
}
