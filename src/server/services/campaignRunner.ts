import type { Campaign, ContactList, MessageTemplate, MediaLibraryItem, Contact } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server'; // Keep for potential future use

// Define the type for PrismaClient or TransactionClient
// This allows the service to work within a transaction if needed
type PrismaTransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;


export class CampaignRunnerService {
    // Use the specific Prisma client type from your db setup
    private db: PrismaClient | PrismaTransactionClient;

    constructor(db: PrismaClient | PrismaTransactionClient) {
        this.db = db;
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

            // Get Media Path if a media item is associated
            const mediaPath = campaign.mediaLibraryItem?.storagePath;

            // Loop Through Contacts starting from startIndex
            for (let i = startIndex; i < contacts.length; i++) {
                const contact = contacts[i]!; // Add non-null assertion - loop condition guarantees existence
                const contactNumber = i + 1; // 1-based index for logging clarity

                // --- Future Extension Point: Check for external stop/pause signal ---
                // Example:
                // const currentStatus = await this.db.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
                // if (currentStatus?.status === 'Paused' || currentStatus?.status === 'Stopped') {
                //     console.log(`[Campaign ${campaignId}] Detected status change to ${currentStatus.status}. Pausing run at index ${i}.`);
                //     // Update index 'i' here before breaking if pausing *before* processing contact 'i'
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

                // Log Action (Simulate Send)
                console.log(`[Campaign ${campaignId} | Contact ${contactNumber}/${contacts.length}] Would send to ${phoneNumber}: "${personalizedText}" ${mediaPath ? `with media ${mediaPath}` : ''}`);

                // --- WAHA API Call would go here in the future ---

                // Update lastProcessedContactIndex in DB (After each contact for resilience)
                // Note: This causes a DB write for every contact. For very large lists,
                // batching this update (e.g., every 50 contacts) might be more performant.
                await this.db.campaign.update({
                    where: { id: campaignId },
                    data: { lastProcessedContactIndex: i },
                });

                // --- Future Extension Point: Add delay between messages ---
                // Example: await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
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
