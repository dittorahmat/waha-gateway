# Final Plan: Implement Status Check & Pause Logic in Campaign Runner

**1. Goal:**
Implement a check within the `CampaignRunnerService`'s contact processing loop. Before attempting to send a message to each contact, verify the associated WAHA session status. If the status is not `WORKING`, or if the status check itself fails, pause the campaign and save the current progress (`lastProcessedContactIndex`) to allow for correct resumption later.

**2. Files to Modify:**
*   `src/server/services/campaignRunner.ts`: Implement the core logic.
*   `src/server/services/campaignRunner.test.ts`: Add unit tests for the new logic.

**3. Implementation Steps (`src/server/services/campaignRunner.ts`):**

*   **Import `WAHASessionStatus`:**
    ```typescript
    import { WahaApiClient, type WAHASessionStatus } from './wahaClient'; // Add WAHASessionStatus
    ```
*   **Insert Status Check Block:** Inside the `for` loop (around line 118), *before* the `try/catch` block for sending messages (around line 145):
    ```typescript
    // --- BEGIN WAHA SESSION STATUS CHECK ---
    try {
        console.log(`[Campaign ${campaignId} | Contact ${contactNumber}/${contacts.length}] Checking WAHA session status for ${sessionName}...`);
        const sessionState = await this.wahaApiClient.getSessionStatus(sessionName);
        const currentStatus: WAHASessionStatus = sessionState.status;

        if (currentStatus !== "WORKING") {
            console.warn(`[Campaign ${campaignId}] WAHA session '${sessionName}' status is '${currentStatus}', not 'WORKING'. Pausing campaign.`);
            // Update status and save the index of the contact we were ABOUT TO process.
            // This ensures resume starts correctly at this contact.
            await this.db.campaign.update({
                where: { id: campaignId },
                data: {
                    status: 'Paused',
                    lastProcessedContactIndex: i
                },
            });
            break; // Exit the contact processing loop
        }
        console.log(`[Campaign ${campaignId} | Contact ${contactNumber}/${contacts.length}] WAHA session '${sessionName}' is WORKING. Proceeding.`);

    } catch (statusCheckError) {
        console.error(`[Campaign ${campaignId}] CRITICAL ERROR checking WAHA session status for '${sessionName}'. Pausing campaign. Error:`, statusCheckError);
        // Update status and save the index of the contact we were ABOUT TO process before pausing due to error.
        // This ensures resume starts correctly at this contact.
        await this.db.campaign.update({
            where: { id: campaignId },
            data: {
                status: 'Paused',
                lastProcessedContactIndex: i
            },
        });
        break; // Exit the contact processing loop
    }
    // --- END WAHA SESSION STATUS CHECK ---

    // --- BEGIN SEND ATTEMPT BLOCK ---
    try {
        // ... existing code to determine if sending image or text ...

        if (campaign.mediaLibraryItem) {
            // ... existing code to read file and call sendImageMessage ...
            // ... existing success log and sentCount increment ...
        } else {
            // ... existing code to call sendTextMessage ...
            // ... existing success log and sentCount increment ...
        }

    } catch (error) {
        // --- Handle API Call Failure ---
        console.error(`[Campaign ${campaignId} | Contact ${contactNumber}] Failed to send message to ${chatId}:`, error);
        // Increment failed count on error
        await this.db.campaign.update({
            where: { id: campaignId },
            data: { failedCount: { increment: 1 } },
        });
        // Continue to the next contact (do not break the loop for individual send failures)
    }
    // --- END SEND ATTEMPT BLOCK ---

    // Update lastProcessedContactIndex AFTER attempting to process contact 'i'.
    // This signifies that contact 'i' has been handled (either sent or failed).
    // If the campaign completes normally, this index will eventually be reset to null.
    // If it stops unexpectedly after this point but before the next iteration's
    // status check, resuming would correctly start at i + 1.
    await this.db.campaign.update({
        where: { id: campaignId },
        data: { lastProcessedContactIndex: i },
    });

    // --- Add configurable randomized delay ---
    // ... existing delay logic ...
    ```
*   **Verify Existing Logic:** Ensure the initial check for `campaign.status !== 'Scheduled'` (around line 61) and the final update to `Completed` (around line 243, resetting `lastProcessedContactIndex` to `null`) remain correct.

**4. Testing Plan:**

*   **Unit Tests (`src/server/services/campaignRunner.test.ts`):**
    *   Mock `wahaApiClient.getSessionStatus` to return various statuses (`WORKING`, `SCAN_QR_CODE`, `FAILED`, etc.) and to throw errors.
    *   Mock `db.campaign.update`.
    *   Assert that the loop breaks, `db.campaign.update` is called with `status: 'Paused'` and the correct `lastProcessedContactIndex: i` when the status is not `WORKING` or when `getSessionStatus` throws.
    *   Assert that the loop continues and the send attempt logic is reached when the status is `WORKING`.
    *   Verify appropriate console logs.
*   **Manual/E2E Tests:**
    *   Start a campaign.
    *   During the inter-message delay, manually stop the associated WAHA session (e.g., via logout, stopping the container).
    *   Observe the campaign status changing to `Paused` in the application/database.
    *   Check server logs for status check warnings/errors and the pausing message.
    *   Verify `lastProcessedContactIndex` in the database reflects the index of the contact that was *next* in line to be processed when the pause occurred.
    *   (Optional) Restart the WAHA session and implement/test campaign resume functionality (if not already present) to ensure it starts from the saved index.

**5. Mermaid Diagram:**

```mermaid
graph TD
    subgraph Campaign Run with Status Check
        A[Start runCampaign] --> B{Fetch Campaign & Session};
        B -- Valid --> C{Update Campaign Status: Running};
        C --> D{Fetch Contacts};
        D --> E{Loop Through Contacts (index i)};
        E -- Contact exists --> F[Check WAHA Session Status];
        F -- Success --> G{Status == 'WORKING'?};
        F -- Failure (Catch Error) --> H[Log Status Check Error];
        H --> I{Update DB: Status=Paused, lastIndex=i};
        I --> J[Break Loop];
        G -- No --> K[Log Not Working Status];
        K --> I;
        G -- Yes --> L[Attempt Send Message (try/catch)];
        L -- Send Success --> M{Increment Sent Count};
        L -- Send Failure --> N{Increment Failed Count};
        M --> O{Update DB: lastIndex=i (Attempted)};
        N --> O;
        O --> P{Apply Delay};
        P --> E; // Next contact
        E -- No more contacts --> Q{Update DB: Status=Completed, lastIndex=null};
        Q --> R[End Run];
        J --> R; // End Run after break
        B -- Invalid --> S[Update DB: Status=Failed/Log];
        S --> R;
    end