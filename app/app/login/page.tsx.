"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);
    if (result?.error) {
      setError("Invalid email or password");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 360, margin: "4rem auto", padding: "0 1rem", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.3rem", marginBottom: "1.5rem" }}>Log in to Xenos Predictions</h1>
      <form onSubmit={handleSubmit}>
        <label style={{ display: "block", fontSize: "0.8rem", color: "#666", marginBottom: "0.25rem" }}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ width: "100%", padding: "0.5rem", borderRadius: 6, border: "1px solid #ccc", marginBottom: "0.75rem" }}
        />
        <label style={{ display: "block", fontSize: "0.8rem", color: "#666", marginBottom: "0.25rem" }}>
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ width: "100%", padding: "0.5rem", borderRadius: 6, border: "1px solid #ccc", marginBottom: "1rem" }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "0.6rem",
            borderRadius: 6,
            border: "none",
            background: "#111",
            color: "white",
            fontWeight: 600,
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "Logging in..." : "Log in"}
        </button>
        {error && <p style={{ color: "#a00", fontSize: "0.8rem", marginTop: "0.5rem" }}>{error}</p>}
      </form>
    </main>
  );
}
