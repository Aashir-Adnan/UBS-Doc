import type { ReactNode } from 'react'
import { useAuthTyped as useAuth } from '../portal/authTypes'
import { usePortalAccess } from '../portal/usePortalAccess'
import AccessState from './AccessState'

export default function ToolGuard({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  const { allowed, loading } = usePortalAccess()
  if (loading) return <AccessState kind="loading" />
  if (!allowed) return <AccessState kind="restricted" email={user?.email ?? undefined} onSignOut={signOut} />
  return <>{children}</>
}
