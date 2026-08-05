import type { Theme } from '../../types'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  width?: number | string
  theme: Theme
}

export default function SearchInput({ value, onChange, placeholder = 'Search…', width = 220, theme }: Props) {
  const d = theme === 'dark'

  return (
    <div className="search-poda" style={{ width }}>
      <div className="search-glow" />
      <div className="search-dark-border" />
      <div className="search-dark-border" />
      <div className="search-dark-border" />
      <div className="search-white" />
      <div className="search-border" />
      <div className="search-main">
        {/* Search icon */}
        <div className="search-icon-left">
          <svg xmlns="http://www.w3.org/2000/svg" width={16} height={16} viewBox="0 0 24 24"
            strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" fill="none">
            <circle stroke="url(#sg1)" r={8} cy={11} cx={11} />
            <line stroke="url(#sg2)" y2="16.65" y1={22} x2="16.65" x1={22} />
            <defs>
              <linearGradient gradientTransform="rotate(50)" id="sg1">
                <stop stopColor="#a5b4fc" offset="0%" />
                <stop stopColor="#6366f1" offset="100%" />
              </linearGradient>
              <linearGradient id="sg2">
                <stop stopColor="#6366f1" offset="0%" />
                <stop stopColor="#4F46E5" offset="100%" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="search-input-field"
          style={{ color: d ? '#e2e8f0' : '#0f172a' }}
        />

        {/* Filter icon */}
        <div className="search-filter-border" />
        <div className="search-filter-btn">
          <svg preserveAspectRatio="none" height={18} width={18} viewBox="4.8 4.56 14.832 15.408" fill="none">
            <path d="M8.16 6.65H15.83C16.47 6.65 16.99 7.17 16.99 7.81V9.09C16.99 9.56 16.7 10.14 16.41 10.43L13.91 12.64C13.56 12.93 13.33 13.51 13.33 13.98V16.48C13.33 16.83 13.1 17.29 12.81 17.47L12 17.98C11.24 18.45 10.2 17.92 10.2 16.99V13.91C10.2 13.5 9.97 12.98 9.73 12.69L7.52 10.36C7.23 10.08 7 9.55 7 9.2V7.87C7 7.17 7.52 6.65 8.16 6.65Z"
              stroke="#818cf8" strokeWidth={1} strokeMiterlimit={10} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </div>
  )
}
