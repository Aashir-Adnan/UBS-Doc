import { useAuth as useAuthUntyped } from './authStore'

// authStore.jsx is plain JS with checkJs off: useContext(AuthContext) resolves
// to the type of createContext(null)'s argument (`null`), so tsc infers
// useAuth()'s return type from control-flow analysis of that always-null
// value rather than the real runtime shape. Same class of issue as App.tsx's
// initFirebase re-typing — an ambient `declare module` does not help because
// the specifier resolves to a real file, so the inferred signature wins.
// Re-typed once, here, so every TSX consumer (guards now, screens later)
// imports a single typed accessor instead of re-deriving this cast.
export interface AuthUser {
  uid: string
  email: string | null
  name: string | null
  photoURL: string | null
}

export interface AuthContextValue {
  user: AuthUser | null
  setUser: (user: AuthUser | null) => void
  signOut: () => Promise<void>
  loading: boolean
  /** Sign-in or session-expiry message, surfaced on the sign-in card. */
  authError: string | null
}

export const useAuthTyped = useAuthUntyped as unknown as () => AuthContextValue
