interface Props {
  children: React.ReactNode
  className?: string
}

export default function AuroraText({ children, className = '' }: Props) {
  return (
    <span className={`aurora-text ${className}`}>
      {children}
    </span>
  )
}
