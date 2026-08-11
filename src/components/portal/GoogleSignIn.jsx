import { GoogleAuthProvider, getAuth, signInWithPopup } from "firebase/auth";
import { useAuth } from "./authStore";
import { initFirebase } from "./firebase";
import { useState, useEffect } from "react";
import { store } from "@site/src/state/store";

const provider = new GoogleAuthProvider();

export default function GoogleSignIn() {
  // The portal session is established by AuthProvider's onAuthStateChanged
  // handler, which exchanges the Firebase ID token for the framework access
  // token before it reports the user as signed in. This component only opens
  // the popup — it deliberately does not setUser, because doing so would let
  // the app start making API calls before a token exists.
  const { authError } = useAuth();
  const [runtimeStatus, setRuntimeStatus] = useState(
    () => store.getState().runtimeKeys.status
  );
  const [runtimeError, setRuntimeError] = useState(
    () => store.getState().runtimeKeys.error
  );

  useEffect(() => {
    return store.subscribe(() => {
      const { status, error } = store.getState().runtimeKeys;
      setRuntimeStatus(status);
      setRuntimeError(error);
    });
  }, []);

  // Runtime keys only OVERRIDE the build-time Firebase config; when the fetch
  // fails the app falls back to it and sign-in still works. Surfacing the
  // backend's error text on the sign-in card gives the person signing in
  // something they can't act on, so it goes to the console instead — where it
  // stays diagnosable for whoever is configuring the backend or the env.
  useEffect(() => {
    if (runtimeStatus === "failed" && runtimeError) {
      console.warn(
        `[runtime keys] ${runtimeError} — falling back to build-time config; sign-in is unaffected.`
      );
    }
  }, [runtimeStatus, runtimeError]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const handleSignIn = async () => {
    if (runtimeStatus === "loading") return;
    const app = initFirebase();
    if (!app) {
      setError("Firebase is not configured. Check your environment variables.");
      return;
    }
    const auth = getAuth(app);
    try {
      setLoading(true);
      setError(null);
      await signInWithPopup(auth, provider);
      // Leave `loading` set: AuthProvider now takes over to exchange the ID
      // token, and this card unmounts once that succeeds. Clearing it here
      // would flash the button back for the length of the exchange.
    } catch (e) {
      setLoading(false);
      // Keep the UI silent on "popup closed by user", but surface other failures.
      if (e?.code !== "auth/popup-closed-by-user") {
        setError(e?.message || "Firebase sign-in failed");
      }
    }
  };

  // The exchange failing (or a session expiring) leaves the card mounted, so
  // give the button back.
  useEffect(() => {
    if (authError) setLoading(false);
  }, [authError]);
  
  return (
    <div className="google-signin-wrap">
      <button
        type="button"
        className="google-button"
        onClick={handleSignIn}
        disabled={loading || runtimeStatus === "loading"}
      >
        <span className="google-icon" aria-hidden="true">
          G
        </span>
        <span>
          {runtimeStatus === "loading"
            ? "Securing config…"
            : loading
              ? "Signing in…"
              : "Continue with Google"}
        </span>
      </button>
      {(error || authError) && (
        <p className="google-signin-error" role="alert">
          {error || authError}
        </p>
      )}
    </div>
  );
}
