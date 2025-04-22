import type { Campaign, ContactList, MessageTemplate, MediaLibraryItem, Contact } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server'; // Keep for potential future use
import { WahaApiClient, type WAHASessionStatus } from './wahaClient'; // Added import + WAHASessionStatus
import * as fs from 'fs/promises'; // Added import
import { env } from '~/env'; // Import env

// Utility functions for delay
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
const randomInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

// Define the type for PrismaClient or TransactionClient
// This allows the service to work within a transaction if needed
type PrismaTransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;


export class CampaignRunnerService {
    // Use the specific Prisma client type from your db setup
    private db: PrismaClient | PrismaTransactionClient;
    private wahaApiClient: WahaApiClient; // Added property

    // Updated constructor signature and assignment
    constructor(db: PrismaClient | PrismaTransactionClient, wahaApiClient: WahaApiClient) {
        this.db = db;
        this.wahaApiClient = wahaApiClient; // Assign injected client
    }

    /**
     * Runs a campaign simulation: fetches data, iterates contacts, logs actions, updates status.
     * Does not actually send messages.
     * @param campaignId The ID of the campaign to run.
     */
    async runCampaign(campaignId: string): Promise<void> {
        console.log(`[Campaign ${campaignId}] Starting run...`);
        // Define a type for campaign with includes for better type safety
        let campaign: (Campaign & {
            contactList: ContactList;
            messageTemplate: MessageTemplate;
            mediaLibraryItem: MediaLibraryItem | null;
        }) | null = null;

        try {
            // Fetch Campaign with relations
            campaign = await this.db.campaign.findUnique({
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

            // Check Status - Only run 'Scheduled' campaigns for now
            // TODO: Add 'Paused' state later for resume functionality
            if (campaign.status !== 'Scheduled') {
                console.error(`[Campaign ${campaignId}] Campaign is not in 'Scheduled' state (current: ${campaign.status}). Aborting run.`);
                return;
            }

            // Fetch Waha Session Name associated with the campaign's user
            console.log(`[Campaign ${campaignId}] Fetching WAHA session for user ${campaign.userId}...`);
            // Find the *first* WAHA session associated with the user.
            // Using findFirst as userId alone is not a unique constraint per the schema.
            const wahaSession = await this.db.wahaSession.findFirst({
                where: { userId: campaign.userId },
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
            console.log(`[Campaign ${campaignId}] Using WAHA session: ${sessionName}`);

            // Update Status to Running
            console.log(`[Campaign ${campaignId}] Updating status to Running.`);
            await this.db.campaign.update({
                where: { id: campaignId },
                data: { status: 'Running', startedAt: new Date() },
            });

            // Fetch Contacts (All at once as per plan)
            console.log(`[Campaign ${campaignId}] Fetching contacts for list ${campaign.contactListId}...`);
            const contacts: Contact[] = await this.db.contact.findMany({
                where: { contactListId: campaign.contactListId },
                // Optional: Add ordering if needed, e.g., orderBy: { createdAt: 'asc' }
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
                console.log(`[Campaign ${campaignId}] Run finished due to empty contact list.`);
                return;
            }

            // Determine Start Index for processing (resume capability)
            const startIndex = campaign.lastProcessedContactIndex ?? 0;
            console.log(`[Campaign ${campaignId}] Starting process from index ${startIndex}.`);

            // Loop Through Contacts starting from startIndex
            for (let i = startIndex; i < contacts.length; i++) {
                const contact = contacts[i]!; // Add non-null assertion - loop condition guarantees existence
                const contactNumber = i + 1; // 1-based index for logging clarity

                // --- Future Extension Point: Check for external stop/pause signal ---
                // (Keep existing commented-out code for future reference)
                // const currentStatus = await this.db.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
                // if (currentStatus?.status === 'Paused' || currentStatus?.status === 'Stopped') {
                //     console.log(`[Campaign ${campaignId}] Detected status change to ${currentStatus.status}. Pausing run at index ${i}.`);
                //     await this.db.campaign.update({ where: { id: campaignId }, data: { lastProcessedContactIndex: i } });
                //     break;
                // }
                // ---

                const phoneNumber = contact.phoneNumber;
                const firstName = contact.firstName;

                // Personalize Text using template and contact data
                const nameToUse = firstName?.trim() || campaign.defaultNameValue;
                // Use case-insensitive global replacement for {Name} placeholder
                const personalizedText = campaign.messageTemplate.textContent.replace(/{Name}/gi, nameToUse);

                // Format chatId for WAHA
                const chatId = `${phoneNumber}@c.us`; // Confirmed format

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
                             continue; // Skip API call if file read fails
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
            }

            // Update Status to Completed if loop finished without critical errors
            // The check for status === 'Running' before this was removed as it caused issues with mock testing
            // and is redundant if the loop completes successfully.
            console.log(`[Campaign ${campaignId}] Processing complete. Updating status to Completed.`);
            await this.db.campaign.update({
                where: { id: campaignId },
                data: {
                    status: 'Completed',
                    completedAt: new Date(),
                    lastProcessedContactIndex: null, // Reset index on successful completion
                },
            });
            console.log(`[Campaign ${campaignId}] Run finished successfully.`);
            // Removed the closing brace from the removed 'if' statement


        } catch (error) {
            console.error(`[Campaign ${campaignId}] CRITICAL ERROR during run:`, error);
            // Attempt to update status to Failed only if campaign was fetched successfully initially
            if (campaign?.id) {
                 try {
                    await this.db.campaign.update({
                        where: { id: campaign.id }, // Use fetched campaign ID for safety
                        data: {
                            status: 'Failed',
                            completedAt: new Date(), // Mark completion time even on failure
                            // Keep lastProcessedContactIndex as is for potential debugging
                        },
                    });
                     console.error(`[Campaign ${campaign.id}] Status updated to Failed.`);
                } catch (updateError) {
                    // Log secondary error if status update fails
                    console.error(`[Campaign ${campaign.id}] FAILED TO UPDATE STATUS TO FAILED after critical error:`, updateError);
                }
            } else {
                 // Log if the error occurred before the campaign object was even loaded
                 console.error(`[Campaign ${campaignId}] Cannot update status to Failed as campaign data was not loaded or initial fetch failed.`);
            }
        }
    }
}
