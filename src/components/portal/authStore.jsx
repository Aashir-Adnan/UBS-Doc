import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { getAuth, onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { initFirebase } from './firebase';
import { store } from '@site/src/state/store';
import {
  getAccessToken, clearAccessToken, onSessionExpired,
} from '@site/src/services/authToken';
import { exchangeIdTokenForAccessToken } from '@site/src/services/portalSignIn';

const AuthContext = createContext(null);

function toUserData(firebaseUser) {
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email ?? null,
    name: firebaseUser.displayName ?? firebaseUser.email ?? null,
    photoURL: firebaseUser.photoURL ?? null,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const unsubAuthRef = useRef(null);
  // Whether Firebase has reported a signed-in user yet. Gates the "Firebase
  // never initialised" timeout below so a slow token exchange can't trip it.
  const sawFirebaseUserRef = useRef(false);

  const trySubscribe = useCallback(() => {
    // Already listening
    if (unsubAuthRef.current) return;
    const app = initFirebase();
    if (!app) return;
    const auth = getAuth(app);
    unsubAuthRef.current = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        sawFirebaseUserRef.current = false;
        clearAccessToken();
        setUser(null);
        setLoading(false);
        return;
      }

      sawFirebaseUserRef.current = true;
      setAuthError(null);

      // A Firebase session restored on reload (or opened in a new tab) has no
      // portal access token, because the token lives in sessionStorage and the
      // backend now derives identity from it. Exchange the ID token BEFORE
      // reporting the user as signed in: SiteGate dispatches fetchUserUrdds the
      // moment `user` is non-null, and that call would 401 without a token and
      // knock the session straight back out.
      if (!getAccessToken()) {
        setLoading(true);
        try {
          const idToken = await firebaseUser.getIdToken();
          await exchangeIdTokenForAccessToken(idToken);
        } catch (e) {
          clearAccessToken();
          setAuthError(e?.message || 'Could not start a portal session.');
          setUser(null);
          setLoading(false);
          return;
        }
      }

      setUser(toUserData(firebaseUser));
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    // Try immediately (Firebase may already be initialized)
    trySubscribe();

    // Also listen for Redux store changes (runtime keys loading triggers initFirebase in AuthRoot)
    const unsubStore = store.subscribe(() => {
      trySubscribe();
    });

    return () => {
      unsubStore();
      if (unsubAuthRef.current) {
        unsubAuthRef.current();
        // Must be nulled, not just called: trySubscribe treats a non-null ref
        // as "already listening". StrictMode runs mount → cleanup → mount in
        // dev, so leaving the stale unsubscribe here made the second mount
        // early-return and the provider never listened again. That was
        // survivable while GoogleSignIn called setUser itself; now that the
        // session is established from this callback, it hung sign-in outright.
        unsubAuthRef.current = null;
      }
    };
  }, [trySubscribe]);

  // A 401 on any portal call means the token the backend gave us is no longer
  // good. Sign out of Firebase too, so the next attempt is a real re-auth
  // producing a fresh ID token rather than a replay of the dead session.
  useEffect(() => onSessionExpired(() => {
    setAuthError('Your session expired. Please sign in again.');
    setUser(null);
    const app = initFirebase();
    if (app) firebaseSignOut(getAuth(app)).catch(() => {});
  }), []);

  // If Firebase never initializes, stop showing loading after a timeout. Skipped
  // once a user has been seen — from then on `loading` belongs to the token
  // exchange, which must not be cut short.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!sawFirebaseUserRef.current) setLoading(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  const signOut = async () => {
    clearAccessToken();
    const app = initFirebase();
    if (app) {
      await firebaseSignOut(getAuth(app));
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, signOut, loading, authError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return {
      user: null, setUser: () => {}, signOut: () => {}, loading: false, authError: null,
    };
  }
  return ctx;
}
