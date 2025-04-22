# Plan: Implement Configurable Randomized Delay in Campaign Runner

**Goal:** Add a mandatory, configurable randomized delay (defaulting to 6-12 seconds) between sending messages in the `CampaignRunnerService`, reading the configuration from environment variables.

**Files to Modify:**

1.  `.env.example` (Add new variables)
2.  `.env` (Add new variables)
3.  `src/env.js` (Update validation schema)
4.  `src/server/services/campaignRunner.ts` (Add utils, import env, implement delay logic)

**Steps:**

1.  **Define Environment Variables:**
    *   Add the following lines to `.env.example`:
        ```dotenv
        # Delay between campaign messages (in milliseconds)
        CAMPAIGN_MIN_DELAY_MS=6000
        CAMPAIGN_MAX_DELAY_MS=12000
        ```
    *   Add the same lines to the local `.env` file, adjusting values as needed.

2.  **Update Environment Schema (`src/env.js`):**
    *   Modify the `server` object to include schema definitions using `z.coerce.number().int().min(0)` and provide defaults:
        ```javascript
        server: {
          // ... other variables
          WAHA_API_KEY: z.string(), // Added WAHA API Key
          CAMPAIGN_MIN_DELAY_MS: z.coerce.number().int().min(0).default(6000), // Default 6s
          CAMPAIGN_MAX_DELAY_MS: z.coerce.number().int().min(0).default(12000), // Default 12s
          NODE_ENV: z
            .enum(["development", "test", "production"])
            .default("development"),
        },
        ```
    *   Modify the `runtimeEnv` object to map the new variables:
        ```javascript
        runtimeEnv: {
          // ... other variables
          WAHA_API_KEY: process.env.WAHA_API_KEY, // Added WAHA API Key
          CAMPAIGN_MIN_DELAY_MS: process.env.CAMPAIGN_MIN_DELAY_MS,
          CAMPAIGN_MAX_DELAY_MS: process.env.CAMPAIGN_MAX_DELAY_MS,
          NODE_ENV: process.env.NODE_ENV,
        },
        ```

3.  **Add Utility Functions (`src/server/services/campaignRunner.ts`):**
    *   Import `env` at the top.
    *   Define `sleep` and `randomInt` after imports:
    ```typescript
    import { env } from '~/env'; // Import env

    // Utility functions for delay
    const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
    const randomInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

    // ... rest of the file
    ```

4.  **Modify `runCampaign` Method (`src/server/services/campaignRunner.ts`):**
    *   Locate the end of the contact processing loop, after the `try/catch` block (ends line ~206) and after the `lastProcessedContactIndex` update (ends line ~215).
    *   Replace the existing comment block (lines ~217-219) with the following logic:
    ```typescript
    // ... inside the for loop, after the lastProcessedContactIndex update ...

                // --- Add configurable randomized delay between messages ---
                const minDelay = env.CAMPAIGN_MIN_DELAY_MS;
                const maxDelay = env.CAMPAIGN_MAX_DELAY_MS;

                // Ensure min <= max before calculating delay
                if (minDelay <= maxDelay) {
                    const delay = randomInt(minDelay, maxDelay);
                    console.log(`[Campaign ${campaignId} | Contact ${contactNumber}/${contacts.length}] Applying delay of ${delay}ms (Range: ${minDelay}-${maxDelay}ms) before next action.`);
                    await sleep(delay);
                } else {
                     // Log a warning if min > max, but still proceed (maybe with minDelay?)
                     console.warn(`[Campaign ${campaignId}] Delay configuration error: CAMPAIGN_MIN_DELAY_MS (${minDelay}) is greater than CAMPAIGN_MAX_DELAY_MS (${maxDelay}). Using minimum delay.`);
                     await sleep(minDelay); // Apply minimum delay as a fallback
                }
                // ---

            } // End of the for loop

    // ... rest of the function ...
    ```

5.  **Testing (Manual):**
    *   Ensure the new variables are set in `.env`.
    *   Restart the application (`npm run dev` or similar).
    *   Trigger a campaign with 2-3 contacts.
    *   Observe console logs to verify the delay message, the delay value range, and the actual timing between steps.