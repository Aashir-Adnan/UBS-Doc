import type { Theme } from '../types'
import type { Screen } from '../types'

interface Props { navigate: (s: Screen) => void; theme: Theme }

export default function SignIn({ navigate }: Props) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">

      <div className="relative z-10 w-full max-w-[440px]">
        {/* Card */}
        <div className="card-dark rounded-3xl p-10">
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

          <h1 className="text-white font-extrabold text-[32px] text-center mb-2"
            style={{ letterSpacing: '-0.025em', lineHeight: 1.1 }}>
            Sign in to UBS
          </h1>
          <p className="text-white/48 text-sm text-center mb-8 font-medium">
            Your team's developer operations hub
          </p>

          {/* Google button */}
          <button
            onClick={() => navigate('tools')}
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl font-semibold text-sm tr
              bg-white text-slate-800 border border-white/10 hover:bg-white/95 hover:shadow-lg"
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
            <GoogleSVG />
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-4 my-7">
            <div className="flex-1 h-px bg-white/8" />
            <span className="text-white/22 text-xs font-semibold">or</span>
            <div className="flex-1 h-px bg-white/8" />
          </div>

          {/* Helper */}
          <div className="rounded-xl px-5 py-4 bg-white/[0.04] border border-white/6">
            <p className="text-center text-xs text-white/40 leading-relaxed">
              Access is limited to <span className="text-indigo-400 font-semibold font-mono">@granjur.com</span> accounts.<br />
              Contact your administrator to provision access.
            </p>
          </div>

          {/* Footer */}
          <p className="text-center text-[11px] text-white/22 mt-6">
            By continuing, you agree to UBS's internal usage policy.
          </p>
        </div>

        {/* Floating hint */}
        <p className="text-center text-white/28 text-xs mt-5 font-medium">
          UBS Dev Tools Portal · v2.4.1
        </p>
      </div>
    </div>
  )
}

function GoogleSVG() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}
