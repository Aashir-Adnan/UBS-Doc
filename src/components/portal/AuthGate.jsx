import { useAuth } from "./authStore";
import GoogleSignIn from "./GoogleSignIn";

export default function AuthGate({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="portal-hero-center">Loading...</div>;
  }

  if (!user) {
    return (
      <main className="portal-main-wrapper portal-main-wrapper--center">
        <section className="portal-auth-card portal-auth-centered">
          <h2 className="card-title">Sign in</h2>

          <p className="card-subtitle">
            Use your Google account to access Granjur Dev tools.
          </p>

          <GoogleSignIn />

          <p className="card-helper">
            Use your organization's @granjur.com account for full access.
          </p>
        </section>
      </main>
    );
  }

  return children;
}
