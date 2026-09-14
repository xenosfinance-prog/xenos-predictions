import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isAdmin: boolean;
      xenosPremium: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    isAdmin?: boolean;
    xenosPremium?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    isAdmin?: boolean;
    xenosPremium?: boolean;
  }
}
