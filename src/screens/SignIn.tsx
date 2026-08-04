import AnoAI from '../components/ui/animated-shader-background'
import GoogleSignIn from '../components/portal/GoogleSignIn'

// Always dark-styled, regardless of the app theme (matches the design) — this
// screen renders standalone, outside AppLayout, so it hosts its own shader
// background rather than relying on AppLayout's.
export default function SignIn() {
  return (
    <div className="min-h-screen relative" style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", background: '#04070F' }}>
      <AnoAI className="fixed inset-0 w-full h-full" opacity={0.9} />
      <div className="fixed inset-0 pointer-events-none" style={{ background: 'rgba(4,7,15,0.38)' }} />

      <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden z-10">
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

            {/* Google sign-in — real auth, restyled to the design's pill via
                the .portal-google-btn scope in portal-compat.css */}
            <div className="portal-google-btn">
              <GoogleSignIn />
            </div>

            {/* Divider */}
            <div className="flex items-center gap-4 my-7">
              <div className="flex-1 h-px bg-white/8" />
              <span className="text-white/22 text-xs font-semibold">or</span>
              <div className="flex-1 h-px bg-white/8" />
            </div>

            {/* Helper */}
            <div className="rounded-xl px-5 py-4 bg-white/[0.04] border border-white/6">
              <p className="text-center text-xs text-white/40 leading-relaxed">
                Access is limited to <span className="text-indigo-400 font-semibold font-mono">@granjur.com</span> accounts,
                or an organization account provisioned by your administrator.
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
    </div>
  )
}
