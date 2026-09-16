import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type SignInStatus = "idle" | "sending" | "sent" | "throttled" | "error";
type CurrentUser = { id: string; email: string } | null;

function readUrlMessage(): string | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get("welcome") === "1") {
    return "You're signed in.";
  }
  if (params.get("signin") === "expired") {
    return "That sign-in link expired. Request a new one.";
  }
  if (params.get("signin") === "invalid") {
    return "That sign-in link is invalid. Request a new one.";
  }
  return null;
}

function App() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SignInStatus>("idle");
  const [urlMessage, setUrlMessage] = useState<string | null>(() => readUrlMessage());
  const [user, setUser] = useState<CurrentUser>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => response.json())
      .then((body: { user: CurrentUser }) => setUser(body.user))
      .catch(() => setUser(null));
  }, []);

  async function requestLoginLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setUrlMessage(null);

    try {
      const response = await fetch("/api/auth/start-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        setStatus("sent");
        return;
      }
      if (response.status === 429) {
        setStatus("throttled");
        return;
      }
      setStatus("error");
    } catch {
      setStatus("error");
    }
  }

  function signOut() {
    setUser(null);
  }

  return (
    <main>
      <p className="eyebrow">Brainless Chef</p>
      <h1>Good food, fewer decisions.</h1>

      <section className="account">
        {user ? (
          <>
            <p className="intro">Signed in as {user.email}.</p>
            <button type="button" onClick={signOut}>
              Sign out
            </button>
          </>
        ) : (
          <form onSubmit={requestLoginLink}>
            <label htmlFor="email">Sign in to start planning meals</label>
            <div className="signin-row">
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
              <button type="submit" disabled={status === "sending"}>
                Email me a link
              </button>
            </div>
          </form>
        )}
      </section>

      {urlMessage && <p className="message">{urlMessage}</p>}
      {status === "sent" && <p className="message">Check your email for the sign-in link.</p>}
      {status === "throttled" && <p className="message">Wait a moment before requesting another link.</p>}
      {status === "error" && <p className="message">Something went wrong. Try again in a moment.</p>}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);