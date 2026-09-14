import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuth } from "../context/AdminAuthContext";

function AdminLogin() {
  const { signIn, signOut, session } = useAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Landing on this page — whether via a fresh link click, or navigating
  // back from deeper in the admin section — should always require a new
  // login. Sign out any lingering in-memory session so the form actually
  // shows, instead of silently trusting a session from earlier in this
  // browser tab's lifetime.
  useEffect(() => {
    if (session) {
      signOut();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error: signInError } = await signIn(email, password);

    if (signInError) {
      setError(signInError);
      setSubmitting(false);
    } else {
      // No `replace` here — this keeps the login page in browser history,
      // so pressing back from the dashboard correctly returns to sign-in
      // (which then forces a fresh login via the effect above) instead of
      // skipping past it to whatever page came before.
      navigate("/admin/dashboard");
    }
  }

  return (
    <div className="admin-login">
      <h1 className="admin-title acme-regular text-outline">Admin Login</h1>
      <form className="admin-login-form" onSubmit={handleSubmit}>
        <input
          type="email"
          className="identity-input"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          className="identity-input"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="admin-error">{error}</p>}
        <button
          type="submit"
          className="nav-menu-trigger"
          disabled={submitting}
        >
          {submitting ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}

export default AdminLogin;
