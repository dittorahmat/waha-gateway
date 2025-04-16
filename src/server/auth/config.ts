import { PrismaAdapter } from "@auth/prisma-adapter";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import bcrypt from "bcryptjs";

import { db } from "~/server/db";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      // ...other properties
      // role: UserRole;
    } & DefaultSession["user"];
  }

  // interface User {
  //   // ...other properties
  //   // role: UserRole;
  // }
}

const CredentialsSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(1, { message: "Password is required" }), // Min 1 for presence check, length check done in signup
});

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authConfig = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      // Define the fields that will be shown on the sign-in form.
      credentials: {
        email: { label: "Email", type: "email", placeholder: "jsmith@example.com" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        // Validate input using Zod schema
        const parsedCredentials = CredentialsSchema.safeParse(credentials);

        if (!parsedCredentials.success) {
          console.error("Invalid credentials format:", parsedCredentials.error);
          return null; // Or throw an error specific to validation failure
        }

        const { email, password } = parsedCredentials.data;

        const user = await db.user.findUnique({
          where: { email: email },
        });

        if (!user || !user.password) {
          // User not found or password not set (e.g., social login user)
          return null;
        }

        // Compare the provided password with the hashed password in the database
        const passwordValid = await bcrypt.compare(
          password,
          user.password
        );

        if (!passwordValid) {
          return null; // Passwords don't match
        }

        // Return the user object if authentication is successful
        // Ensure the returned object matches the User type expected by NextAuth
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          // Add other user properties if needed, ensure they exist in the User model
        };
      },
    }),
  ],
  adapter: PrismaAdapter(db),
  callbacks: {
    // Use JWT strategy for credentials provider
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        // Add other token properties if needed
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string; // Add id from token to session user
        // Add other session properties if needed
      }
      return session;
    },
  },
  session: {
    strategy: "jwt", // Required for Credentials provider
  },
  pages: {
    signIn: '/auth/signin', // Redirect users to custom sign-in page
    // error: '/auth/error', // Optional: Custom error page
  }
} satisfies NextAuthConfig;
