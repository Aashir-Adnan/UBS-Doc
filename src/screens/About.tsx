import { Camera, Briefcase, GitBranch } from 'lucide-react'
import { c, card, txt, muted, Breadcrumb } from '../lib'
import { useTheme } from '../app/ThemeContext'

// lucide-react ships no brand marks (Instagram/LinkedIn/GitHub) in this
// version — generic icons stand in so the row still reads as a link list.
const LINKS = [
  { label: 'Instagram', href: 'https://www.instagram.com/ihavethisthingwithsatire/', Icon: Camera },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/aashir-adnan-69521b253/', Icon: Briefcase },
  { label: 'GitHub', href: 'https://github.com/Aashir-Adnan', Icon: GitBranch },
]

export default function About() {
  const { theme } = useTheme()
  const d = theme === 'dark'

  return (
    <div className={c('min-h-full', d ? 'aurora-dark' : 'aurora-light')}>
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-10 py-8 lg:py-12">
        <Breadcrumb items={['UBS', 'About']} theme={theme} />

        <div className={c(card(theme), 'p-8 max-w-xl')}>
          <p className="section-kicker text-indigo-500 mb-3">About the developer</p>
          <h1 className={c('font-extrabold mb-3', txt(theme))} style={{ fontSize: 28, letterSpacing: '-0.02em' }}>
            Built and maintained by Aashir Adnan
          </h1>
          <p className={c('text-sm mb-7 leading-relaxed', muted(theme))}>
            Connect with Aashir across platforms. Follow or reach out using the links below.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            {LINKS.map(({ label, href, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                className={c('btn-outline-indigo flex items-center gap-2 px-5 py-2.5 text-sm', d ? 'dark-variant' : '')}>
                <Icon size={14} /> {label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
