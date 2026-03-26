import { GoogleAuthProvider, getAuth, signInWithPopup } from "firebase/auth";
import { useAuth } from "./authStore";
import { initFirebase } from "./firebase";
import { useState } from "react";

const provider = new GoogleAuthProvider();

export default function GoogleSignIn() {
  const { setUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const handleSignIn = async () => {
    const app = initFirebase();
    if (!app) {
      setError("Firebase is not configured. Check your environment variables.");
      return;
    }
    const auth = getAuth(app);
    try {
      setLoading(true);
      setError(null);
      const result = await signInWithPopup(auth, provider);
      const { user } = result;
      const idToken = await user.getIdToken();

      setUser({
        uid: user.uid,
        email: user.email ?? null,
        name: user.displayName ?? user.email ?? null,
        photoURL: user.photoURL ?? null,
      });
    } catch (e) {
      // Keep the UI silent on "popup closed by user", but surface other failures.
      if (e?.code !== "auth/popup-closed-by-user") {
        setError(e?.message || "Firebase sign-in failed");
      }
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="google-signin-wrap">
      <button
        type="button"
        className="google-button"
        onClick={handleSignIn}
        disabled={loading}
      >
        <span className="google-icon" aria-hidden="true">
          G
        </span>
        <span>{loading ? 'Signing in…' : 'Continue with Google'}</span>
      </button>
      {error && (
        <p className="google-signin-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
