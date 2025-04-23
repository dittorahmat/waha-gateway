# Plan: Implement Manual Campaign Resume

**Goal:** Allow users to manually resume a 'Paused' campaign via the UI, triggering the backend to continue processing from where it left off.

**Phase 1: Backend Implementation**

1.  **Modify `CampaignRunnerService` (`src/server/services/campaignRunner.ts`):**
    *   **Goal:** Allow the service to run campaigns that are in the 'Paused' state.
    *   **Action:** Update the initial status check (around line 61) to accept both 'Scheduled' and 'Paused' statuses before proceeding.
    ```typescript
    // Original check:
    // if (campaign.status !== 'Scheduled') { ... }

    // Updated check:
    if (campaign.status !== 'Scheduled' && campaign.status !== 'Paused') {
        console.error(`[Campaign ${campaignId}] Campaign is not in 'Scheduled' or 'Paused' state (current: ${campaign.status}). Aborting run.`);
        return;
    }
    ```

2.  **Add `resume` Procedure to tRPC Router (`src/server/api/routers/campaign.ts`):**
    *   **Goal:** Create the API endpoint to handle the resume request.
    *   **Action:** Implement a new `protectedProcedure` named `resume`.
        *   Define input schema using Zod: `z.object({ campaignId: z.string().cuid() })`.
        *   Fetch the campaign using `ctx.db.campaign.findUniqueOrThrow`, ensuring it belongs to `ctx.session.user.id`.
        *   Verify the campaign status is exactly 'Paused'. Throw a `TRPCError` if not found, not owned, or not paused.
        *   Update the campaign status to 'Scheduled' in the database: `ctx.db.campaign.update(...)`.
        *   **Crucially:** Instantiate `WahaApiClient` and `CampaignRunnerService` (likely similar to how `schedulerService` is handled, possibly needing access via `ctx` or importing a singleton instance if available) and immediately call `campaignRunnerService.runCampaign(input.campaignId)`. *This needs careful handling of service instantiation.*
        *   Return `{ success: true }`.

**Phase 2: Frontend Implementation**

1.  **Update Campaign Table Component (`src/app/dashboard/campaigns/_components/campaign-table.tsx`):**
    *   **Goal:** Display a "Resume" button for paused campaigns and trigger the backend procedure.
    *   **Action:**
        *   Fetch campaign data using `api.campaign.list.useQuery()`.
        *   In the table definition (likely using `@tanstack/react-table` or similar), add a column for actions.
        *   Conditionally render a `<Button variant="outline" size="sm">Resume</Button>` within the actions column *only if* `campaign.status === 'Paused'`.
        *   Import `api` from `~/trpc/react`.
        *   Initialize the mutation hook: `const resumeMutation = api.campaign.resume.useMutation();`.
        *   Get the tRPC context utilities: `const utils = api.useUtils();`.
        *   Add an `onClick` handler to the "Resume" button:
            ```javascript
            onClick={() => {
              resumeMutation.mutate(
                { campaignId: campaign.id },
                {
                  onSuccess: () => {
                    // Invalidate the list query to refresh the table
                    utils.campaign.list.invalidate();
                    // Optional: Show a success toast/notification
                  },
                  onError: (error) => {
                    // Optional: Show an error toast/notification
                    console.error("Failed to resume campaign:", error);
                  }
                }
              );
            }}
            ```
        *   Disable the button while the mutation is pending (`resumeMutation.isLoading`).

**Phase 3: Testing**

1.  **Integration Test (`campaign.test.ts` or similar):**
    *   Test the `resume` tRPC procedure.
    *   Mock the database (`ctx.db`) and the `CampaignRunnerService.runCampaign` method.
    *   Verify:
        *   Throws error if campaign not found, not owned, or not 'Paused'.
        *   Updates campaign status to 'Scheduled' in the DB mock.
        *   Calls the mocked `runCampaign` method with the correct `campaignId`.
2.  **Manual/E2E Test:**
    *   Create and schedule a campaign with multiple contacts.
    *   Start the campaign.
    *   Simulate a pause condition (e.g., disconnect the WAHA client/session). Verify the campaign status changes to 'Paused' in the UI.
    *   Reconnect the WAHA client/session.
    *   Navigate to the campaign history page.
    *   Click the "Resume" button for the paused campaign.
    *   Verify:
        *   The button click triggers the mutation.
        *   The campaign status updates in the UI (briefly 'Scheduled', then 'Running').
        *   The campaign eventually reaches 'Completed'.
        *   Check WAHA logs/WhatsApp to confirm messages were sent *only* for the remaining contacts (those after the `lastProcessedContactIndex` when it was paused).

**Visual Plan (Mermaid):**

```mermaid
graph TD
    subgraph Frontend (React/Next.js)
        A[Campaign Table Component: campaign-table.tsx] -- User clicks 'Resume' --> B{Handle Resume Click};
        B -- Calls tRPC Mutation --> C[api.campaign.resume.useMutation];
        C -- On Success --> D[utils.campaign.list.invalidate];
        D -- Refreshes --> A;
        E[api.campaign.list.useQuery] --> A;
    end

    subgraph Backend (tRPC/Prisma/Node.js)
        F[tRPC Router: campaign.ts] -- Receives request --> G{resume Procedure};
        G -- Verifies Ownership & Status='Paused' --> H[Fetch Campaign (DB)];
        G -- Updates Status --> I[Update Campaign Status='Scheduled' (DB)];
        G -- Triggers Runner --> J[Instantiate CampaignRunnerService];
        J -- Calls --> K[CampaignRunnerService.runCampaign];
        K -- Reads Status & Index --> H;
        K -- Checks Status='Scheduled' OR 'Paused' --> L{Process Contacts};
        L -- Sends Messages --> M[WAHA API Client];
        L -- Updates Progress --> N[Update Campaign Counts/Index (DB)];
        K -- On Completion/Error --> O[Update Campaign Status='Completed'/'Failed' (DB)];
    end

    C -- HTTP Request --> F;
    H -- Data --> G;
    I -- Success --> G;
    O -- Data --> E;
    N -- Data --> E;

    style A fill:#f9f,stroke:#333,stroke-width:2px
    style F fill:#ccf,stroke:#333,stroke-width:2px
    style K fill:#cfc,stroke:#333,stroke-width:2px
```

**Key Considerations:**

*   **Service Instantiation:** The exact method for instantiating `WahaApiClient` and `CampaignRunnerService` within the `resume` tRPC procedure needs to be confirmed based on the project's dependency injection or service management pattern (e.g., checking `src/server/db.ts` or `src/server/api/trpc.ts`).
*   **Error Handling:** Robust error handling on both frontend (showing feedback to the user) and backend (logging, appropriate status updates) is crucial.
*   **Concurrency:** While immediate execution via the service is simpler, be mindful that if many users resume campaigns simultaneously, it could load the `CampaignRunnerService`. A queue system would be more scalable long-term but adds complexity. For now, direct execution is acceptable per the requirements.