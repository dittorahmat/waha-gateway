# Plan: Integrate WAHA Sending into CampaignRunnerService

**Goal:** Modify the `CampaignRunnerService` to call the actual WAHA API service methods (`sendText` or `sendImage`) for each contact. Update campaign summary counts based on API call success/failure.

**Context:** The basic `CampaignRunnerService` loop exists and logs intended actions. The `WahaApiClient` service with `sendText` and `sendImage` methods is implemented. `storagePath` for media items points to a locally readable file path. The required `chatId` format for WAHA is `number@c.us`.

## 1. Modify `CampaignRunnerService` (`src/server/services/campaignRunner.ts`)

*   **Import necessary modules:** Add `import { WahaApiClient } from './wahaClient';` and `import * as fs from 'fs/promises';`.
*   **Update Constructor:** Modify the constructor to accept `WahaApiClient` as a dependency.
    ```typescript
    // Add WahaApiClient to properties
    private wahaApiClient: WahaApiClient;

    // Update constructor signature and assignment
    constructor(db: PrismaClient | PrismaTransactionClient, wahaApiClient: WahaApiClient) {
        this.db = db;
        this.wahaApiClient = wahaApiClient; // Assign injected client
    }
    ```
*   **Fetch Waha Session:** Inside `runCampaign`, *before* updating the status to 'Running' and fetching contacts, fetch the user's `WahaSession`:
    ```typescript
    // Fetch Waha Session Name associated with the campaign's user
    const wahaSession = await this.db.wahaSession.findUnique({
        where: { userId: campaign.userId }, // Assuming unique session per user for now
        select: { sessionName: true }
    });

    if (!wahaSession?.sessionName) {
        console.error(`[Campaign ${campaignId}] No active WAHA session found for user ${campaign.userId}. Marking campaign as Failed.`);
        await this.db.campaign.update({
            where: { id: campaignId },
            data: { status: 'Failed', completedAt: new Date() },
        });
        return; // Stop processing
    }
    const sessionName = wahaSession.sessionName;
    ```
*   **Modify Contact Loop:**
    *   Remove the simulation `console.log` (around line 118).
    *   **Format `chatId`:** Construct the `chatId` for WAHA:
        ```typescript
        const chatId = `${contact.phoneNumber}@c.us`; // Confirmed format
        ```
    *   **Determine Action (Text vs. Image):** Check if `campaign.mediaLibraryItem` exists.
    *   **Implement API Call Logic:** Replace the simulation block (around lines 117-121) with:
        ```typescript
        try {
            if (campaign.mediaLibraryItem) {
                // --- Send Image ---
                const mediaItem = campaign.mediaLibraryItem;
                console.log(`[Campaign ${campaignId} | Contact ${contactNumber}/${contacts.length}] Attempting to send image to ${chatId} from ${mediaItem.storagePath}`);

                // Read image file
                let imageBase64: string;
                try {
                    // Assuming storagePath is a local, readable path
                    const fileBuffer = await fs.readFile(mediaItem.storagePath);
                    imageBase64 = fileBuffer.toString('base64');
                } catch (readError) {
                     console.error(`[Campaign ${campaignId} | Contact ${contactNumber}] Failed to read media file ${mediaItem.storagePath}:`, readError);
                     // Increment failed count for this contact due to file read error
                     await this.db.campaign.update({
                         where: { id: campaignId },
                         data: { failedCount: { increment: 1 } },
                     });
                     // Continue to the next contact
                     continue;
                }


                // Call WAHA API for image
                await this.wahaApiClient.sendImageMessage(
                    sessionName,
                    chatId,
                    {
                        filename: mediaItem.filename,
                        base64: imageBase64,
                        mimeType: mediaItem.mimeType,
                    },
                    personalizedText // Use personalized text as caption
                );
                console.log(`[Campaign ${campaignId} | Contact ${contactNumber}] Image send API call successful for ${chatId}.`);
                // Increment sent count on success
                await this.db.campaign.update({
                    where: { id: campaignId },
                    data: { sentCount: { increment: 1 } },
                });

            } else {
                // --- Send Text Only ---
                console.log(`[Campaign ${campaignId} | Contact ${contactNumber}/${contacts.length}] Attempting to send text to ${chatId}`);
                await this.wahaApiClient.sendTextMessage(
                    sessionName,
                    chatId,
                    personalizedText
                );
                 console.log(`[Campaign ${campaignId} | Contact ${contactNumber}] Text send API call successful for ${chatId}.`);
                // Increment sent count on success
                await this.db.campaign.update({
                    where: { id: campaignId },
                    data: { sentCount: { increment: 1 } },
                });
            }
        } catch (error) {
            // --- Handle API Call Failure ---
            console.error(`[Campaign ${campaignId} | Contact ${contactNumber}] Failed to send message to ${chatId}:`, error);
            // Increment failed count on error
            await this.db.campaign.update({
                where: { id: campaignId },
                data: { failedCount: { increment: 1 } },
            });
            // Do NOT re-throw; continue to the next contact
        }

        // Update lastProcessedContactIndex (already exists, keep it after the try/catch)
        // Ensure this happens *after* the try/catch block for the API call
        await this.db.campaign.update({
             where: { id: campaignId },
             data: { lastProcessedContactIndex: i },
         });

        // --- Add Delay (Optional - Placeholder) ---
        // await new Promise(resolve => setTimeout(resolve, 1000));
        ```

## 2. Update Service Instantiation

Wherever `CampaignRunnerService` is created (likely in a tRPC router or another service, e.g., `src/server/api/routers/campaign.ts`), ensure the `WahaApiClient` instance is passed to its constructor.

```typescript
import { WahaApiClient } from '~/server/services/wahaClient';
import { CampaignRunnerService } from '~/server/services/campaignRunner';
import { db } from '~/server/db'; // Assuming db instance is available

// Instantiate WahaApiClient (consider singleton pattern if appropriate)
const wahaClient = new WahaApiClient();

// Instantiate CampaignRunnerService with dependencies
const campaignRunner = new CampaignRunnerService(db, wahaClient);

// Example usage within a tRPC procedure:
// await campaignRunner.runCampaign(input.campaignId);
```

## 3. Testing Plan

*   **Unit Tests (`src/server/services/campaignRunner.test.ts`):**
    *   Mock `WahaApiClient` using `vi.mock()` and provide mock implementations for `sendTextMessage` and `sendImageMessage`.
    *   Mock `fs/promises`'s `readFile` method.
    *   Mock `db.wahaSession.findUnique` to simulate session found/not found scenarios.
    *   Mock `db.campaign.update` to verify calls for status changes, `sentCount`, `failedCount`, and `lastProcessedContactIndex`.
    *   Assert that the correct WAHA client methods are called with the expected parameters (`sessionName`, formatted `chatId`, text/file details, caption).
    *   Assert that `sentCount` or `failedCount` is incremented correctly based on mocked API call success/failure and file read success/failure.
*   **Manual/Integration Tests:**
    *   Set up `.env` with correct `WAHA_BASE_URL` and `WAHA_API_KEY`.
    *   Ensure a WAHA session is running and linked to a test user account in the DB.
    *   Create a campaign with a contact list containing a *test WhatsApp number*.
    *   Create campaigns for both text-only and image messages (ensure the image file exists at the specified `storagePath`).
    *   Trigger the campaign run (e.g., via the temporary tRPC procedure).
    *   **Verification:**
        *   Check if the message(s) arrive on the test WhatsApp number.
        *   Inspect the `Campaign` record in the database to confirm `status`, `sentCount`, and `failedCount` are updated correctly.
        *   Check server logs (`console.log`, `console.error`) for details about the run, including any API errors encountered.

## Diagram

```mermaid
sequenceDiagram
    participant Caller as tRPC Router/Job
    participant CR as CampaignRunnerService
    participant DB as Database (Prisma)
    participant WAHA as WahaApiClient
    participant FS as FileSystem (Node.js)

    Caller->>CR: runCampaign(campaignId)
    CR->>DB: findUnique Campaign (ID, includes)
    DB-->>CR: Campaign Data
    CR->>DB: findUnique WahaSession (userId)
    alt Session Found
        DB-->>CR: WahaSession (sessionName)
        CR->>DB: update Campaign (status='Running')
        DB-->>CR: Success
        CR->>DB: findMany Contact (contactListId)
        DB-->>CR: List<Contact>
        loop For Each Contact
            CR->>CR: Format chatId (e.g., number + @c.us)
            CR->>CR: Personalize Text
            alt Has Media Item
                CR->>FS: readFile(storagePath)
                alt File Read OK
                    FS-->>CR: File Buffer
                    CR->>CR: Convert Buffer to Base64
                    CR->>WAHA: sendImageMessage(session, chatId, file, caption)
                    alt API OK
                        WAHA-->>CR: Success Response
                        CR->>DB: update Campaign (increment sentCount)
                        DB-->>CR: Success
                    else API Error
                        WAHA-->>CR: Error Response
                        CR->>CR: Log API Error
                        CR->>DB: update Campaign (increment failedCount)
                        DB-->>CR: Success
                    end
                else File Read Error
                    FS-->>CR: Error
                    CR->>CR: Log File Read Error
                    CR->>DB: update Campaign (increment failedCount)
                    DB-->>CR: Success
                    CR->>CR: Continue to next contact
                end
            else No Media Item
                CR->>WAHA: sendTextMessage(session, chatId, text)
                 alt API OK
                    WAHA-->>CR: Success Response
                    CR->>DB: update Campaign (increment sentCount)
                    DB-->>CR: Success
                else API Error
                    WAHA-->>CR: Error Response
                    CR->>CR: Log API Error
                    CR->>DB: update Campaign (increment failedCount)
                    DB-->>CR: Success
                end
            end
            CR->>DB: update Campaign (lastProcessedIndex)
            DB-->>CR: Success
            CR->>CR: Optional Delay
        end
        CR->>DB: update Campaign (status='Completed', reset index)
        DB-->>CR: Success
    else Session Not Found
        DB-->>CR: null
        CR->>CR: Log Error: No Session
        CR->>DB: update Campaign (status='Failed')
        DB-->>CR: Success
        CR-->>Caller: Return/Finish
    else Critical Error (e.g., initial Campaign fetch fails)
         CR->>CR: Catch Error
         CR->>CR: Log Critical Error
         opt Campaign data exists
            CR->>DB: update Campaign (status='Failed')
            DB-->>CR: Success or Log Update Error
         end
         CR-->>Caller: Throw or Return Error
    end
    CR-->>Caller: Return/Finish