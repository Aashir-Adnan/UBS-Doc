import { useEffect, type ReactNode } from 'react'
import { useDispatch } from 'react-redux'
import { useAuthTyped as useAuth } from '../portal/authTypes'
import { fetchUserUrdds as fetchUserUrddsUntyped, clearOrg } from '../../state/orgSlice'
import SignIn from '../../screens/SignIn'
import AccessState from './AccessState'

// orgSlice.js's createAsyncThunk payload creator has no JSDoc on its `email`
// parameter, so — same class of issue useAuthTyped works around in
// authTypes.ts — tsc infers the thunk's argument type as `undefined` instead
// of `string`. Re-type the binding rather than the call site; the `as never`
// still wrapping `dispatch(...)` below is unrelated — it sidesteps
// configureStore's untyped-thunk Dispatch signature, not this argument type.
const fetchUserUrdds = fetchUserUrddsUntyped as unknown as (email: string) => ReturnType<typeof fetchUserUrddsUntyped>

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
