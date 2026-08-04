import { useEffect, type ReactNode } from 'react'
import { useDispatch } from 'react-redux'
import { useAuth as useAuthUntyped } from '../portal/authStore'
import { fetchUserUrdds as fetchUserUrddsUntyped, clearOrg } from '../../state/orgSlice'
import SignIn from '../../screens/SignIn'
import AccessState from './AccessState'

// orgSlice.js's createAsyncThunk payload creator has no JSDoc on its `email`
// parameter, so — same class of issue as useAuth below — tsc infers the
// thunk's argument type as `undefined` instead of `string`. Re-type the
// binding rather than the call site; the `as never` still wrapping
// `dispatch(...)` below is unrelated — it sidesteps configureStore's
// untyped-thunk Dispatch signature, not this argument type.
const fetchUserUrdds = fetchUserUrddsUntyped as unknown as (email: string) => ReturnType<typeof fetchUserUrddsUntyped>

// authStore.jsx is plain JS with checkJs off: useContext(AuthContext) resolves
// to the type of createContext(null)'s argument (`null`), so tsc infers
// useAuth()'s return type from control-flow analysis of that always-null
// value rather than the real runtime shape. Same fix as App.tsx's
// initFirebase re-typing — an ambient `declare module` does not help because
// the specifier resolves to a real file, so the inferred signature wins.
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

export default function SiteGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const dispatch = useDispatch()
  useEffect(() => {
    if (user?.email) dispatch(fetchUserUrdds(user.email) as never)
    else dispatch(clearOrg())
  }, [user?.email, dispatch])
  if (loading) return <AccessState kind="loading" />
  if (!user) return <SignIn />
  return <>{children}</>
}
