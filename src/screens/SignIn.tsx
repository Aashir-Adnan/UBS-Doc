import AnoAI from '../components/ui/animated-shader-background'
import GoogleSignIn from '../components/portal/GoogleSignIn'
import BorderBeam from '../components/ui/border-beam'
import AuroraText from '../components/ui/aurora-text'
import ThemeSwitch from '../components/ThemeSwitch'
import { c } from '../lib'
import { useTheme } from '../app/ThemeContext'

// This screen renders standalone, outside AppLayout, so it hosts its own
// shader background and its own theme switch rather than relying on the
// sidebar's. The light recipe below is AppLayout's, deliberately: the root
// background stays #04070F in both themes and the pale overlay is what covers
// it, so the two screens cannot drift to different shades of "light".
export default function SignIn() {
  const { theme, toggleTheme } = useTheme()
  const d = theme === 'dark'

  return (
    <div className="min-h-screen relative" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", background: '#04070F' }}>
      <AnoAI className="fixed inset-0 w-full h-full" opacity={d ? 0.9 : 0.18} />
      <div className="fixed inset-0 pointer-events-none"
        style={{ background: d ? 'rgba(4,7,15,0.38)' : 'rgba(250,248,255,0.88)' }} />

      {/* Above the card's z-10 so it stays clickable, and inset from the
          corner far enough to clear a phone's rounded display. */}
      <div className="fixed top-5 right-5 z-20">
        <ThemeSwitch theme={theme} toggleTheme={toggleTheme}
          className={c('shadow-sm border', d ? 'border-white/8' : 'border-slate-200')} />
      </div>

      <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden z-10">
        <div className="relative z-10 w-full max-w-[440px]">
          {/* Card */}
          <div className={c(d ? 'card-dark' : 'card-light', 'rounded-3xl p-10 relative overflow-hidden')}>
            <BorderBeam duration={5} colorFrom="#4F46E5" colorTo="#10B981" />
            {/* Logo */}
            <div className="flex justify-center mb-9">
              <div className="relative">
                <div className="w-[72px] h-[72px] rounded-2xl flex items-center justify-center"
                  style={{
                    background: '#4F46E5',
                    boxShadow: '0 8px 28px rgba(79,70,229,0.35), 0 0 0 1px rgba(129,140,248,0.2) inset'
                  }}>
                  <span className="text-white font-extrabold text-2xl tracking-tighter">UBS</span>
                </div>
                {/* Glow ring */}
                <div className="absolute inset-0 rounded-2xl"
                  style={{ boxShadow: '0 0 40px rgba(79,70,229,0.3)', pointerEvents: 'none' }} />
              </div>
            </div>

            <h1 className="font-extrabold text-[32px] text-center mb-2"
              style={{ letterSpacing: '-0.025em', lineHeight: 1.1 }}>
              <AuroraText>Sign in to UBS</AuroraText>
            </h1>
            <p className={c('text-sm text-center mb-8 font-medium', d ? 'text-white/48' : 'text-slate-500')}>
              Your team's developer operations hub
            </p>

            {/* Google sign-in — real auth, restyled to the design's pill via
                the .portal-google-btn scope in portal-compat.css. That button
                is white in both themes; only its white border disappears
                against a pale card, so light mode re-draws the edge here
                rather than in the shared stylesheet. */}
            <div className={c('portal-google-btn', !d && '[&_.google-button]:border-slate-200')}>
              <GoogleSignIn />
            </div>

            {/* Divider */}
            <div className="flex items-center gap-4 my-7">
              <div className={c('flex-1 h-px', d ? 'bg-white/8' : 'bg-slate-200')} />
              <span className={c('text-xs font-semibold', d ? 'text-white/22' : 'text-slate-400')}>or</span>
              <div className={c('flex-1 h-px', d ? 'bg-white/8' : 'bg-slate-200')} />
            </div>

            {/* Helper */}
            <div className={c('rounded-xl px-5 py-4 border', d ? 'bg-white/[0.04] border-white/6' : 'bg-slate-50 border-slate-200')}>
              <p className={c('text-center text-xs leading-relaxed', d ? 'text-white/40' : 'text-slate-500')}>
                Access is limited to <span className={c('font-semibold font-mono', d ? 'text-indigo-400' : 'text-indigo-600')}>@granjur.com</span> accounts,
                or an organization account provisioned by your administrator.
              </p>
            </div>

            {/* Footer */}
            <p className={c('text-center text-[11px] mt-6', d ? 'text-white/22' : 'text-slate-400')}>
              By continuing, you agree to UBS's internal usage policy.
            </p>
          </div>

          {/* Floating hint */}
          <p className={c('text-center text-xs mt-5 font-medium', d ? 'text-white/28' : 'text-slate-400')}>
            UBS Dev Tools Portal · v2.4.1
          </p>
        </div>
      </div>
    </div>
  )
}
