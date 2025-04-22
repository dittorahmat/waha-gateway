import type { PrismaClient, Campaign } from '@prisma/client'; // Use type-only import for Campaign
import * as cron from 'node-cron';
import { WahaApiClient } from './wahaClient'; // Assuming path is correct
import { CampaignRunnerService } from './campaignRunner'; // Assuming path is correct

// Define the type for PrismaClient or TransactionClient if needed (copied from campaignRunner for consistency)
type PrismaTransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

// Helper function to convert a Date object to a specific one-time cron pattern
// Note: This assumes the server runs in UTC or the Date object is already in UTC
const dateToCron = (date: Date): string => {
    const seconds = date.getUTCSeconds();
    const minutes = date.getUTCMinutes();
    const hours = date.getUTCHours();
    const days = date.getUTCDate();
    const months = date.getUTCMonth() + 1; // Cron months are 1-12
    // Day of week is not needed for a specific date schedule, use '*'
    return `${seconds} ${minutes} ${hours} ${days} ${months} *`;
};
export class SchedulerService {
    private db: PrismaClient | PrismaTransactionClient;
    private wahaApiClient: WahaApiClient;
    private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();

    constructor(db: PrismaClient | PrismaTransactionClient, wahaApiClient: WahaApiClient) {
        this.db = db;
        this.wahaApiClient = wahaApiClient;
        console.log('[SchedulerService] Initialized.');
    }

    /**
     * Initializes the scheduler by loading and scheduling pending campaigns from the database.
     * Should be called once on application startup.
     */
    async initialize(): Promise<void> {
        console.log('[SchedulerService] Initializing scheduler...');
        try {
            const pendingCampaigns = await this.db.campaign.findMany({
                where: {
                    status: 'Scheduled', // Use string literal instead of enum
                    // Optionally add filter for scheduledAt >= now if runMissedCampaign handles past ones
                },
            });

            console.log(`[SchedulerService] Found ${pendingCampaigns.length} scheduled campaigns to process.`);

            const now = new Date();
            for (const campaign of pendingCampaigns) {
                if (campaign.scheduledAt > now) {
                    this.scheduleCampaignJob(campaign);
                } else {
                    // Campaign scheduled in the past but still 'Scheduled'
                    console.warn(`[SchedulerService] Campaign ${campaign.id} scheduled at ${campaign.scheduledAt.toISOString()} is in the past. Running immediately.`);
                    // Use void to ignore the promise deliberately, allowing initialization to continue
                    void this.runMissedCampaign(campaign.id);
                }
            }
            console.log('[SchedulerService] Initialization complete.');
        } catch (error) {
            console.error('[SchedulerService] CRITICAL ERROR during initialization:', error);
            // Depending on the app structure, might want to throw or handle differently
        }
    }

    /**
     * Schedules a campaign to run at its specified `scheduledAt` time.
     * If a job for this campaign already exists, it will be cancelled and rescheduled.
     * @param campaign The campaign object from Prisma.
     */
    scheduleCampaignJob(campaign: Campaign): void {
        if (!campaign.scheduledAt || campaign.status !== 'Scheduled') { // Use string literal
            console.error(`[SchedulerService] Cannot schedule campaign ${campaign.id}: Missing scheduledAt or status is not Scheduled.`);
            return;
        }

        const now = new Date();
        if (campaign.scheduledAt <= now) {
            console.warn(`[SchedulerService] Attempted to schedule campaign ${campaign.id} for a past date (${campaign.scheduledAt.toISOString()}). Running immediately instead.`);
            void this.runMissedCampaign(campaign.id);
            return;
        }

        // Cancel existing job if any
        this.cancelCampaignJob(campaign.id);

        // Convert the specific Date to a one-time cron pattern string
        const scheduledDate = campaign.scheduledAt;
        const cronPattern = dateToCron(scheduledDate);

        console.log(`[SchedulerService] Scheduling campaign ${campaign.id} to run at ${scheduledDate.toISOString()} (Cron: ${cronPattern})`);

        try {
            // Use the cron pattern string instead of the Date object
            const task = cron.schedule(cronPattern, async () => {
                console.log(`[Scheduler] Running scheduled job for Campaign ${campaign.id}`);
                const runner = new CampaignRunnerService(this.db, this.wahaApiClient);
                try {
                    await runner.runCampaign(campaign.id);
                    console.log(`[Scheduler] Finished job for Campaign ${campaign.id}`);
                } catch (runError) {
                    console.error(`[Scheduler] Error running campaign ${campaign.id} from scheduled job:`, runError);
                    // CampaignRunnerService should handle setting status to Failed internally
                } finally {
                    // Remove job from map after execution (success or failure)
                    this.scheduledJobs.delete(campaign.id);
                    console.log(`[Scheduler] Removed job map entry for Campaign ${campaign.id}`);
                }
            }, {
                scheduled: true,
                timezone: "UTC" // Explicitly set timezone as planned
            });

            this.scheduledJobs.set(campaign.id, task);
            console.log(`[SchedulerService] Successfully scheduled campaign ${campaign.id}. Total jobs: ${this.scheduledJobs.size}`);

        } catch (error) {
             console.error(`[SchedulerService] Failed to schedule job for campaign ${campaign.id}:`, error);
             // Consider how to handle scheduling failures - retry? Mark campaign?
        }
    }

    /**
     * Cancels a scheduled job for a given campaign ID.
     * @param campaignId The ID of the campaign whose job should be cancelled.
     */
    cancelCampaignJob(campaignId: string): void {
        const job = this.scheduledJobs.get(campaignId);
        if (job) {
            job.stop();
            this.scheduledJobs.delete(campaignId);
            console.log(`[SchedulerService] Cancelled scheduled job for campaign ${campaignId}. Total jobs: ${this.scheduledJobs.size}`);
        } else {
            // It's okay if job doesn't exist, might have run already or never scheduled
            // console.warn(`[SchedulerService] No scheduled job found to cancel for campaign ${campaignId}.`);
        }
    }

    /**
     * Runs a campaign that was scheduled for the past but missed (e.g., due to downtime).
     * This is run asynchronously without blocking the caller (typically initialize).
     * @param campaignId The ID of the missed campaign.
     */
    private async runMissedCampaign(campaignId: string): Promise<void> {
        console.log(`[Scheduler] Running missed campaign ${campaignId}...`);
        const runner = new CampaignRunnerService(this.db, this.wahaApiClient);
        try {
            await runner.runCampaign(campaignId);
            console.log(`[Scheduler] Finished running missed campaign ${campaignId}.`);
        } catch (runError) {
            console.error(`[Scheduler] Error running missed campaign ${campaignId}:`, runError);
            // CampaignRunnerService should handle setting status to Failed internally
        }
        // No need to remove from scheduledJobs map here, as it wasn't added for a missed run.
    }

    /**
     * Gracefully stops all scheduled jobs. Call during application shutdown.
     */
    stopAllJobs(): void {
        console.log(`[SchedulerService] Stopping all scheduled jobs (${this.scheduledJobs.size})...`);
        this.scheduledJobs.forEach((job, campaignId) => {
            job.stop();
            console.log(`[SchedulerService] Stopped job for campaign ${campaignId}.`);
        });
        this.scheduledJobs.clear();
        console.log('[SchedulerService] All scheduled jobs stopped.');
    }
}