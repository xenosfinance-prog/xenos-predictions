/**
 * lib/auth.ts
 *
 * Credentials-based auth (email + password), matching the spec
 * decision: NextAuth/Auth.js in THIS app, bridged to the main site's
 * premium system via a synced `xenosPremium` boolean on the User
 * row — not live cross-domain session sharing. The main site's
 * xenos-ai-proxy Worker is expected to call
 * POST /api/webhooks/premium-sync (see below) whenever a user's
 * premium status changes there; this app never calls out to check
 * premium status live, it only trusts its own cached copy.
 *
 * That's a deliberate simplicity trade-off for the MVP: it means a
 * premium cancellation on the main site can take up to however often
 * the webhook fires to reflect here, not the same instant. Fine for
 * a virtual-points prediction market; would NOT be fine if real
 * money were gated by this flag.
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          // Deliberately identical failure path to "wrong password" —
          // returning null either way avoids leaking which emails
          // are registered.
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.displayName,
          isAdmin: user.isAdmin,
          xenosPremium: user.xenosPremium,
        };
      },
    }),
  ],
  callbacks: {
    // Carry the fields the app actually needs (isAdmin, xenosPremium)
    // from the authorize() result into the JWT, then out into the
    // session — NextAuth doesn't do this automatically for custom
    // fields.
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.isAdmin = (user as { isAdmin?: boolean }).isAdmin ?? false;
        token.xenosPremium = (user as { xenosPremium?: boolean }).xenosPremium ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.isAdmin = token.isAdmin as boolean;
        session.user.xenosPremium = token.xenosPremium as boolean;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
