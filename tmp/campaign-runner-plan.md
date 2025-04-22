# Campaign Runner Service Implementation Plan

**Goal:** Create a backend service (`CampaignRunnerService`) that simulates running a marketing campaign by processing contacts and logging intended actions, without actually sending messages via WAHA API yet.

**Decisions (Simplest Implementation):**

1.  **Contact Fetching:** Fetch **all** contacts at once.
2.  **Resume Index Update:** Update `lastProcessedContactIndex` **after each contact**.
3.  **Error Logging:** Log a **generic failure message** and update status to `Failed` on unexpected errors.
4.  **Mid-Run Status Changes:** **Ignore** external status changes during a run.

**1. File Structure:**

*   **Create/Modify:** `src/server/services/campaignRunner.ts`
*   **Create:** `src/server/services/campaignRunner.test.ts`
*   **Verify/Modify:** `src/server/api/routers/campaign.ts` (Ensure `runManually` tRPC procedure exists, add user ownership check, `await` the service call).

**2. `CampaignRunnerService` (`src/server/services/campaignRunner.ts`):**

*   **Class Definition:**
    ```typescript
    import { PrismaClient, Campaign, ContactList, MessageTemplate, MediaLibraryItem, Contact } from '@prisma/client'; // Import specific types
    import { TRPCError } from '@trpc/server'; // For potential specific errors if needed later

    // Assuming db is injected or imported correctly
    // import { db } from '~/server/db'; // Example if using a global instance

    type PrismaTransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;


    export class CampaignRunnerService {
        // Use the specific Prisma client type from your db setup
        private db: PrismaClient | PrismaTransactionClient;

        constructor(db: PrismaClient | PrismaTransactionClient) {
            this.db = db;
        }

        async runCampaign(campaignId: string): Promise<void> {
            console.log(`[Campaign ${campaignId}] Starting run...`);
            try {
                // Fetch Campaign with relations
                const campaign = await this.db.campaign.findUnique({
                    where: { id: campaignId },
                    include: {
                        contactList: true, // Needed for fetching contacts
                        messageTemplate: true, // Needed for text content
                        mediaLibraryItem: true, // Needed for media path (optional)
                    },
                });

                if (!campaign) {
                    console.error(`[Campaign ${campaignId}] Campaign not found.`);
                    // No status update here as the campaign doesn't exist in the DB context
                    return;
                }

                // Check Status
                // TODO: Add 'Paused' state later if resume functionality is fully built
                if (campaign.status !== 'Scheduled') {
                    console.error(`[Campaign ${campaignId}] Campaign is not in 'Scheduled' state (current: ${campaign.status}). Aborting run.`);
                    return;
                }

                // Update Status to Running
                console.log(`[Campaign ${campaignId}] Updating status to Running.`);
                await this.db.campaign.update({
                    where: { id: campaignId },
                    data: { status: 'Running', startedAt: new Date() },
                });

                // Fetch Contacts (All at once)
                console.log(`[Campaign ${campaignId}] Fetching contacts for list ${campaign.contactListId}...`);
                const contacts = await this.db.contact.findMany({
                    where: { contactListId: campaign.contactListId },
                    // Optional: Add ordering if needed, e.g., orderBy: { id: 'asc' }
                });
                console.log(`[Campaign ${campaignId}] Found ${contacts.length} contacts.`);


                if (contacts.length === 0) {
                    console.warn(`[Campaign ${campaignId}] No contacts found in the list. Marking as completed.`);
                    await this.db.campaign.update({
                        where: { id: campaignId },
                        data: {
                            status: 'Completed',
                            completedAt: new Date(),
                            lastProcessedContactIndex: null, // Ensure index is cleared
                        },
                    });
                    return;
                }

                // Determine Start Index
                const startIndex = campaign.lastProcessedContactIndex ?? 0;
                console.log(`[Campaign ${campaignId}] Starting process from index ${startIndex}.`);

                // Get Media Path
                const mediaPath = campaign.mediaLibraryItem?.storagePath;

                // Loop Through Contacts
                for (let i = startIndex; i < contacts.length; i++) {
                    const contact = contacts[i];
                    const contactNumber = i + 1; // 1-based for logging

                    // Check for external stop/pause signal (Optional - deferred)
                    // if (await this.shouldStop(campaignId)) { break; }

                    const phoneNumber = contact.phoneNumber;
                    const firstName = contact.firstName;

                    // Personalize Text
                    const nameToUse = firstName?.trim() || campaign.defaultNameValue;
                    const personalizedText = campaign.messageTemplate.textContent.replace(/{Name}/gi, nameToUse); // Case-insensitive replace

                    // Log Action (Simulate Send)
                    console.log(`[Campaign ${campaignId} | Contact ${contactNumber}/${contacts.length}] Would send to ${phoneNumber}: "${personalizedText}" ${mediaPath ? `with media ${mediaPath}` : ''}`);

                    // Update Index in DB (After each contact)
                    // Note: This can be performance intensive on large lists
                    await this.db.campaign.update({
                        where: { id: campaignId },
                        data: { lastProcessedContactIndex: i },
                    });

                    // Simulate delay (Optional - deferred)
                    // await new Promise(resolve => setTimeout(resolve, 1000));
                }

                // Update Status to Completed
                console.log(`[Campaign ${campaignId}] Processing complete. Updating status to Completed.`);
                await this.db.campaign.update({
                    where: { id: campaignId },
                    data: {
                        status: 'Completed',
                        completedAt: new Date(),
                        lastProcessedContactIndex: null, // Reset index on completion
                    },
                });
                console.log(`[Campaign ${campaignId}] Run finished successfully.`);

            } catch (error) {
                console.error(`[Campaign ${campaignId}] CRITICAL ERROR during run:`, error);
                // Attempt to update status to Failed
                try {
                    await this.db.campaign.update({
                        where: { id: campaignId },
                        data: {
                            status: 'Failed',
                            completedAt: new Date(), // Mark completion time even on failure
                        },
                    });
                     console.error(`[Campaign ${campaignId}] Status updated to Failed.`);
                } catch (updateError) {
                    console.error(`[Campaign ${campaignId}] FAILED TO UPDATE STATUS TO FAILED:`, updateError);
                }
            }
        }

        // Example placeholder for a potential stop check (deferred)
        // private async shouldStop(campaignId: string): Promise<boolean> {
        //   const campaign = await this.db.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
        //   return campaign?.status === 'Paused' || campaign?.status === 'Stopped';
        // }
    }
    ```

**3. tRPC Procedure (`src/server/api/routers/campaign.ts`):**

*   Verify/Update the `runManually` procedure:
    ```typescript
    runManually: protectedProcedure
      .input(z.object({ campaignId: z.string().cuid() }))
      .mutation(async ({ ctx, input }) => {
        // Add user ownership check
        const campaign = await ctx.db.campaign.findUnique({
            where: { id: input.campaignId, userId: ctx.session.user.id }
        });
        if (!campaign) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found or access denied.' });
        }
         // Optional: Check if campaign is already running/completed?
        if (['Running', 'Completed', 'Failed'].includes(campaign.status)) {
             throw new TRPCError({ code: 'BAD_REQUEST', message: `Campaign is already in ${campaign.status} state.` });
        }


        const { CampaignRunnerService } = await import('~/server/services/campaignRunner');
        const runner = new CampaignRunnerService(ctx.db);

        // Await the runCampaign call for simplicity in this version
        // The API call will wait until the simulation is done.
        await runner.runCampaign(input.campaignId);
        // Note: Error handling within runCampaign updates status.
        // If runCampaign throws an error *before* the try/catch inside it (unlikely),
        // the tRPC layer will catch it.

        return { success: true, message: "Campaign run triggered and completed/failed." };
      }),
    ```

**4. Unit Testing (`src/server/services/campaignRunner.test.ts`):**

*   Use `vitest` and mocking (e.g., `vi.mock` for Prisma).
*   **Test Cases:**
    *   `runCampaign` successfully processes a 'Scheduled' campaign -> status 'Completed'.
    *   Correctly personalizes messages using `firstName`.
    *   Correctly uses `defaultNameValue` when `firstName` is null/empty.
    *   Includes media path in logs when `mediaLibraryItemId` is set.
    *   Updates `lastProcessedContactIndex` after each contact.
    *   Resumes correctly from `lastProcessedContactIndex`.
    *   Handles campaigns with no contacts -> status 'Completed'.
    *   Returns early if campaign status is not 'Scheduled'.
    *   Updates status to 'Failed' on internal error (mock DB error during loop).
    *   Fetches required relations (template, list, media).
    *   Handles campaign not found gracefully.

**5. Manual Testing:**

*   Create Campaign, Contact List (mix contacts with/without names), Message Template (`{Name}`), optional Media.
*   Trigger `runManually` tRPC endpoint.
*   Check server `console.log` output.
*   Check database (`Campaign` table) for status updates (`Running`, `Completed`/`Failed`), timestamps (`startedAt`, `completedAt`), and `lastProcessedContactIndex`.

**Mermaid Diagram (runCampaign Flow):**

```mermaid
graph TD
    A[Start runCampaign(campaignId)] --> B{Fetch Campaign & Relations};
    B --> B1{Campaign Found?};
    B1 -- No --> B2[Log Error & Return];
    B1 -- Yes --> C{Status == 'Scheduled'?};
    C -- No --> D[Log Error & Return];
    C -- Yes --> E[Update Status: Running, Set startedAt];
    E --> F{Fetch Contacts};
    F --> G{Contacts Exist?};
    G -- No --> H[Log Warn, Update Status: Completed, Set completedAt, Return];
    G -- Yes --> I[Determine startIndex];
    I --> J[Get mediaPath];
    J --> K{Loop Contacts (i = startIndex to end)};
    K -- Contact --> L[Personalize Message];
    L --> M[Log Action];
    M --> N[Update lastProcessedContactIndex in DB];
    N --> K;
    K -- Loop Done --> O[Update Status: Completed, Set completedAt, Clear Index];
    O --> Z[End Successfully];

    subgraph Error Handling
        direction LR
        T1[try] --> T2{Catch Error};
        T2 --> T3[Log CRITICAL Error];
        T3 --> T4[Attempt Update Status: Failed, Set completedAt];
        T4 -- Success --> T5[Log Status Updated];
        T4 -- Failure --> T6[Log Status Update FAILED];
        T5 --> Z_Fail[End Failed];
        T6 --> Z_Fail[End Failed];
    end

    B1 --> T1;
    C --> T1;
    E --> T1;
    F --> T1;
    G --> T1;
    I --> T1;
    J --> T1;
    K --> T1;
    O --> T1;


    style Z fill:#dfffd4,stroke:#333,stroke-width:2px
    style Z_Fail fill:#ffd4d4,stroke:#333,stroke-width:2px
    style D fill:#fff0d4,stroke:#333,stroke-width:1px
    style H fill:#fff0d4,stroke:#333,stroke-width:1px
    style B2 fill:#fff0d4,stroke:#333,stroke-width:1px