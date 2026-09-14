import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Xenos Predictions",
  description: "Virtual prediction markets for macro, FX, commodities, rates, and geopolitics — by XenosFinance.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        <nav
          style={{
            display: "flex",
            gap: "1.25rem",
            alignItems: "center",
            padding: "0.75rem 1.5rem",
            borderBottom: "1px solid #eee",
            fontSize: "0.875rem",
          }}
        >
          <a href="https://xenosfinance.com" style={{ textDecoration: "none", color: "#888", fontSize: "0.8rem" }}>&larr; XenosFinance</a>
          <span style={{ color: "#ddd" }}>|</span>
          <Link href="/" style={{ fontWeight: 700, textDecoration: "none", color: "#111" }}>
            Xenos Predictions
          </Link>
          <Link href="/leaderboard" style={{ textDecoration: "none", color: "#444" }}>
            Leaderboard
          </Link>
          {session?.user && (
            <Link href="/portfolio" style={{ textDecoration: "none", color: "#444" }}>
              Portfolio
            </Link>
          )}
          {session?.user?.isAdmin && (
            <Link href="/admin" style={{ textDecoration: "none", color: "#444" }}>
              Admin
            </Link>
          )}
          <span style={{ marginLeft: "auto", color: "#888" }}>
            {session?.user ? session.user.name : <Link href="/login" style={{ color: "#444" }}>Log in</Link>}
          </span>
        </nav>
        {children}
      </body>
    </html>
  );
}
