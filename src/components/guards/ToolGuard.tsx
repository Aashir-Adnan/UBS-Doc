import type { ReactNode } from 'react'
import { useAuth as useAuthUntyped } from '../portal/authStore'
import { usePortalAccess } from '../portal/usePortalAccess'
import AccessState from './AccessState'

// See SiteGate.tsx for why useAuth needs re-typing here (checkJs-off JS
// module, tsc infers a too-narrow signature from control-flow analysis).
interface AuthUser {
  uid: string
  email: string | null
  name: string | null
  photoURL: string | null
}
interface AuthContextValue {
  user: AuthUser | null
  setUser: (user: AuthUser | null) => void
  signOut: () => Promise<void>
  loading: boolean
}
const useAuth = useAuthUntyped as unknown as () => AuthContextValue

export default function ToolGuard({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  const { allowed, loading } = usePortalAccess()
  if (loading) return <AccessState kind="loading" />
  if (!allowed) return <AccessState kind="restricted" email={user?.email ?? undefined} onSignOut={signOut} />
  return <>{children}</>
}
