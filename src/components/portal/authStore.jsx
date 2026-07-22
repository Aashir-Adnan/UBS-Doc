import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import {
  getAuth,
  onAuthStateChanged,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { initFirebase } from "./firebase";
import { store } from "../../state/store";

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
  const unsubAuthRef = useRef(null);

  const trySubscribe = useCallback(() => {
    // Already listening
    if (unsubAuthRef.current) return;
    const app = initFirebase();
    if (!app) return;
    const auth = getAuth(app);
    unsubAuthRef.current = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser ? toUserData(firebaseUser) : null);
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
      if (unsubAuthRef.current) unsubAuthRef.current();
    };
  }, [trySubscribe]);

  // If Firebase never initializes, stop showing loading after a timeout
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  const signOut = async () => {
    const app = initFirebase();
    if (app) {
      await firebaseSignOut(getAuth(app));
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, signOut, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return { user: null, setUser: () => {}, signOut: () => {}, loading: false };
  }
  return ctx;
}
