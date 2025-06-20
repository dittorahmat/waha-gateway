import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    // AUTH_DISCORD_ID: z.string(), // Removed Discord ID validation
    // AUTH_DISCORD_SECRET: z.string(), // Removed Discord Secret validation
    DATABASE_URL: z.string().url(),
    WAHA_BASE_URL: z.string().url(), // Added WAHA Base URL
    WAHA_API_KEY: z.string().min(1), // Added WAHA API Key, ensure non-empty
    CAMPAIGN_MIN_DELAY_MS: z.coerce.number().int().min(0).default(6000), // Default 6s
    CAMPAIGN_MAX_DELAY_MS: z.coerce.number().int().min(0).default(12000), // Default 12s
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    AUTH_SECRET: process.env.AUTH_SECRET,
    // AUTH_DISCORD_ID: process.env.AUTH_DISCORD_ID, // Removed Discord ID runtime env
    // AUTH_DISCORD_SECRET: process.env.AUTH_DISCORD_SECRET, // Removed Discord Secret runtime env
    DATABASE_URL: process.env.DATABASE_URL,
    WAHA_BASE_URL: process.env.WAHA_BASE_URL, // Added WAHA Base URL
    WAHA_API_KEY: process.env.WAHA_API_KEY, // Added WAHA API Key
    CAMPAIGN_MIN_DELAY_MS: process.env.CAMPAIGN_MIN_DELAY_MS,
    CAMPAIGN_MAX_DELAY_MS: process.env.CAMPAIGN_MAX_DELAY_MS,
    NODE_ENV: process.env.NODE_ENV,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
