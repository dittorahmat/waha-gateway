import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PrismaClient, type Campaign } from '@prisma/client';
import { WahaApiClient } from './wahaClient';
import { CampaignRunnerService } from './campaignRunner';
import { SchedulerService } from './scheduler';
import * as cron from 'node-cron';

// --- Mocks ---
vi.mock('@prisma/client', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@prisma/client')>();
    return {
        ...actual,
        PrismaClient: vi.fn().mockImplementation(() => ({
            campaign: {
                findMany: vi.fn(),
                findUnique: vi.fn(), // Needed if runMissedCampaign fetches details
                update: vi.fn(), // Needed by CampaignRunnerService mock
                delete: vi.fn(), // Needed if testing delete integration later
            },
            // Mock other models if needed by CampaignRunnerService
            contactList: { findUnique: vi.fn() },
            messageTemplate: { findUnique: vi.fn() },
            mediaLibraryItem: { findUnique: vi.fn() },
            contact: { findMany: vi.fn() },
            wahaSession: { findFirst: vi.fn() },
        })),
    };
});

vi.mock('./wahaClient', () => {
    return {
        WahaApiClient: vi.fn().mockImplementation(() => ({
            // Mock methods used by CampaignRunnerService if needed for deeper testing
            getSessionStatus: vi.fn().mockResolvedValue({ status: 'WORKING' }),
            sendTextMessage: vi.fn().mockResolvedValue({}),
            sendImageMessage: vi.fn().mockResolvedValue({}),
        })),
    };
});

vi.mock('./campaignRunner', () => {
    return {
        CampaignRunnerService: vi.fn().mockImplementation(() => ({
            runCampaign: vi.fn().mockResolvedValue(undefined), // Mock the core method
        })),
    };
});

// Mock node-cron
// Define a type for the mock task that includes the callback with potential argument
type CronCallback = (now?: Date | "manual" | "init") => Promise<void>;
type MockCronTask = { stop: () => void; callback: CronCallback };

vi.mock('node-cron', () => ({
    // Explicitly type the callback parameter in the mock implementation
    schedule: vi.fn((_pattern: string, callback: CronCallback): MockCronTask => {
        const mockTask: MockCronTask = {
            stop: vi.fn(),
            callback: callback, // Store callback for manual triggering
        };
        return mockTask;
    }),
    validate: vi.fn().mockReturnValue(true), // Mock validate if used
}));

// --- Test Suite ---

describe('SchedulerService', () => {
    let dbMock: PrismaClient;
    let wahaApiClientMock: WahaApiClient;
    let schedulerService: SchedulerService;
    let campaignRunnerMockInstance: CampaignRunnerService; // To access the mock instance

    // Helper to create mock campaign data
    const createMockCampaign = (id: string, status: 'Scheduled' | 'Running' | 'Completed' | 'Failed', scheduledAt: Date): Campaign => ({
        id,
        userId: `user-${id}`,
        name: `Campaign ${id}`,
        contactListId: `cl-${id}`,
        messageTemplateId: `mt-${id}`,
        mediaLibraryItemId: null,
        defaultNameValue: 'Friend',
        scheduledAt,
        status,
        totalContacts: 10,
        sentCount: 0,
        failedCount: 0,
        startedAt: null,
        completedAt: null,
        createdAt: new Date(),
        // updatedAt: new Date(), // Removed - caused TS error, likely not in base Campaign type or optional
        lastProcessedContactIndex: null,
    });

    beforeEach(() => {
        // Reset mocks before each test
        vi.clearAllMocks();
        // Removed mockScheduledTasks.clear(); - Variable no longer exists

        dbMock = new PrismaClient();
        wahaApiClientMock = new WahaApiClient();
        // Get the mock instance created by CampaignRunnerService mock constructor
        campaignRunnerMockInstance = new CampaignRunnerService(dbMock, wahaApiClientMock);
        // Reset the mock constructor and instance mocks
        vi.mocked(CampaignRunnerService).mockClear();
        vi.mocked(campaignRunnerMockInstance.runCampaign).mockClear();

        schedulerService = new SchedulerService(dbMock, wahaApiClientMock);

        // Mock the CampaignRunnerService constructor to return our specific instance
        vi.mocked(CampaignRunnerService).mockImplementation(() => campaignRunnerMockInstance);

        // Reset cron mock calls
        vi.mocked(cron.schedule).mockClear();

    });

    afterEach(() => {
        schedulerService.stopAllJobs(); // Clean up any potentially running mock jobs
    });

    // --- Initialization Tests ---
    describe('initialize', () => {
        it('should query for scheduled campaigns on initialization', async () => {
            vi.mocked(dbMock.campaign.findMany).mockResolvedValue([]);
            await schedulerService.initialize();
            expect(dbMock.campaign.findMany).toHaveBeenCalledWith({
                where: { status: 'Scheduled' },
            });
        });

        it('should schedule jobs for campaigns scheduled in the future', async () => {
            const futureDate = new Date(Date.now() + 60000); // 1 minute in the future
            const campaign1 = createMockCampaign('c1', 'Scheduled', futureDate);
            vi.mocked(dbMock.campaign.findMany).mockResolvedValue([campaign1]);

            // Spy on the instance method directly
            const scheduleSpy = vi.spyOn(schedulerService, 'scheduleCampaignJob');

            await schedulerService.initialize();

            expect(scheduleSpy).toHaveBeenCalledTimes(1);
            expect(scheduleSpy).toHaveBeenCalledWith(campaign1);
            expect(cron.schedule).toHaveBeenCalled(); // Check that cron.schedule was eventually called by scheduleCampaignJob

            scheduleSpy.mockRestore(); // Clean up spy
        });

        it('should immediately run campaigns scheduled in the past', async () => {
            const pastDate = new Date(Date.now() - 60000); // 1 minute in the past
            const campaign1 = createMockCampaign('c1', 'Scheduled', pastDate);
            vi.mocked(dbMock.campaign.findMany).mockResolvedValue([campaign1]);

            // Spy on the private method (use any for type)
            const runMissedSpy = vi.spyOn(schedulerService as any, 'runMissedCampaign');

            await schedulerService.initialize();

            expect(runMissedSpy).toHaveBeenCalledTimes(1);
            expect(runMissedSpy).toHaveBeenCalledWith(campaign1.id);
            // Check that CampaignRunnerService was instantiated and runCampaign called inside runMissedCampaign
            expect(CampaignRunnerService).toHaveBeenCalledWith(dbMock, wahaApiClientMock);
            expect(campaignRunnerMockInstance.runCampaign).toHaveBeenCalledWith(campaign1.id);

            runMissedSpy.mockRestore();
        });

        it('should handle initialization errors gracefully', async () => {
            const error = new Error('DB connection failed');
            vi.mocked(dbMock.campaign.findMany).mockRejectedValue(error);
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); // Suppress console output

            await schedulerService.initialize();

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                '[SchedulerService] CRITICAL ERROR during initialization:',
                error
            );
            consoleErrorSpy.mockRestore();
        });
    });

    // --- Scheduling Tests ---
    describe('scheduleCampaignJob', () => {
        it('should schedule a job using cron.schedule for a future date', () => {
            const futureDate = new Date(Date.now() + 60000);
            const campaign = createMockCampaign('c2', 'Scheduled', futureDate);

            schedulerService.scheduleCampaignJob(campaign);

            expect(cron.schedule).toHaveBeenCalledTimes(1);
            // Check if called with a pattern derived from the date
            expect(vi.mocked(cron.schedule).mock.calls[0]?.[0]).toMatch(/^\d{1,2} \d{1,2} \d{1,2} \d{1,2} \d{1,2} \*$/); // Basic cron pattern check
            expect(vi.mocked(cron.schedule).mock.calls[0]?.[2]).toEqual({ scheduled: true, timezone: 'UTC' });
        });

        it('should not schedule if status is not Scheduled', () => {
            const futureDate = new Date(Date.now() + 60000);
            const campaign = createMockCampaign('c3', 'Running', futureDate);
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            schedulerService.scheduleCampaignJob(campaign);

            expect(cron.schedule).not.toHaveBeenCalled();
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Cannot schedule campaign c3'));
            consoleErrorSpy.mockRestore();
        });

        it('should immediately run if scheduled date is in the past', () => {
            const pastDate = new Date(Date.now() - 60000);
            const campaign = createMockCampaign('c4', 'Scheduled', pastDate);
             // Spy on the private method
            const runMissedSpy = vi.spyOn(schedulerService as any, 'runMissedCampaign');

            schedulerService.scheduleCampaignJob(campaign);

            expect(cron.schedule).not.toHaveBeenCalled();
            expect(runMissedSpy).toHaveBeenCalledWith(campaign.id);
            expect(campaignRunnerMockInstance.runCampaign).toHaveBeenCalledWith(campaign.id);
            runMissedSpy.mockRestore();
        });

        it('should cancel an existing job before scheduling a new one for the same campaign', () => {
            const futureDate1 = new Date(Date.now() + 60000);
            const futureDate2 = new Date(Date.now() + 120000);
            const campaign = createMockCampaign('c5', 'Scheduled', futureDate1);

            // Schedule first time
            schedulerService.scheduleCampaignJob(campaign);
            const mockTask1 = vi.mocked(cron.schedule).mock.results[0]?.value; // Get the returned mock task

            expect(vi.mocked(cron.schedule)).toHaveBeenCalledTimes(1);

            // Schedule second time with different date (implicitly requires rescheduling)
            campaign.scheduledAt = futureDate2;
            schedulerService.scheduleCampaignJob(campaign);

            expect(mockTask1.stop).toHaveBeenCalledTimes(1); // Ensure the first job's stop() was called
            expect(vi.mocked(cron.schedule)).toHaveBeenCalledTimes(2); // Ensure schedule was called again
        });

        it('should execute CampaignRunnerService.runCampaign when the scheduled job triggers', async () => {
            const futureDate = new Date(Date.now() + 50); // Schedule very soon
            const campaign = createMockCampaign('c6', 'Scheduled', futureDate);

            schedulerService.scheduleCampaignJob(campaign);

            expect(cron.schedule).toHaveBeenCalledTimes(1);
            // Get the callback function from the mock call arguments
            const callbackArg = vi.mocked(cron.schedule).mock.calls[0]?.[1];

            // Type guard to ensure callback is a function before calling
            if (typeof callbackArg === 'function') {
                await callbackArg(new Date()); // Execute the callback with a dummy Date argument
            } else {
                throw new Error("Callback function not captured correctly from cron.schedule mock");
            }

            expect(CampaignRunnerService).toHaveBeenCalledWith(dbMock, wahaApiClientMock);
            expect(campaignRunnerMockInstance.runCampaign).toHaveBeenCalledWith(campaign.id);
        });

         it('should remove the job from the map after the job callback executes', async () => {
            const futureDate = new Date(Date.now() + 50);
            const campaign = createMockCampaign('c7', 'Scheduled', futureDate);

            schedulerService.scheduleCampaignJob(campaign);
            const callbackArg = vi.mocked(cron.schedule).mock.calls[0]?.[1];
            const internalJobsMap = (schedulerService as any).scheduledJobs as Map<string, MockCronTask>; // Use MockCronTask type

            expect(internalJobsMap.has(campaign.id)).toBe(true); // Job should be in map initially

            // Type guard for callback execution
            if (typeof callbackArg === 'function') {
                await callbackArg(new Date()); // Execute the job with a dummy Date argument
            } else {
                throw new Error("Callback function not captured correctly");
            }

            expect(internalJobsMap.has(campaign.id)).toBe(false); // Job should be removed after execution
        });
    });

    // --- Cancellation Tests ---
    describe('cancelCampaignJob', () => {
        it('should stop the cron job and remove it from the map if it exists', () => {
            const futureDate = new Date(Date.now() + 60000);
            const campaign = createMockCampaign('c8', 'Scheduled', futureDate);

            // Schedule the job first
            schedulerService.scheduleCampaignJob(campaign);
            const mockTask = vi.mocked(cron.schedule).mock.results[0]?.value;
            const internalJobsMap = (schedulerService as any).scheduledJobs as Map<string, any>;
            expect(internalJobsMap.has(campaign.id)).toBe(true);

            // Cancel the job
            schedulerService.cancelCampaignJob(campaign.id);

            expect(mockTask.stop).toHaveBeenCalledTimes(1);
            expect(internalJobsMap.has(campaign.id)).toBe(false);
        });

        it('should do nothing if the job does not exist in the map', () => {
             const internalJobsMap = (schedulerService as any).scheduledJobs as Map<string, MockCronTask>; // Use MockCronTask type
             // Store initial size
             const initialSize = internalJobsMap.size;

             schedulerService.cancelCampaignJob('non-existent-id');

             // Check that the map hasn't changed and no stop was called implicitly
             // (since no task object would be retrieved to call stop() on)
             expect(internalJobsMap.has('non-existent-id')).toBe(false);
             expect(internalJobsMap.size).toBe(initialSize);
             // Removed the problematic spyOn(cron.ScheduledTask.prototype, 'stop')
        });
    });

     // --- Missed Run Tests ---
    describe('runMissedCampaign', () => {
        it('should instantiate CampaignRunnerService and call runCampaign', async () => {
            const campaignId = 'missed-campaign';
            await (schedulerService as any).runMissedCampaign(campaignId); // Call private method

            expect(CampaignRunnerService).toHaveBeenCalledWith(dbMock, wahaApiClientMock);
            expect(campaignRunnerMockInstance.runCampaign).toHaveBeenCalledWith(campaignId);
        });

        it('should handle errors during runCampaign execution', async () => {
            const campaignId = 'missed-fail';
            const runError = new Error('Failed to run missed campaign');
            vi.mocked(campaignRunnerMockInstance.runCampaign).mockRejectedValueOnce(runError);
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            await (schedulerService as any).runMissedCampaign(campaignId);

            expect(campaignRunnerMockInstance.runCampaign).toHaveBeenCalledWith(campaignId);
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                `[Scheduler] Error running missed campaign ${campaignId}:`,
                runError
            );
            consoleErrorSpy.mockRestore();
        });
    });

    // --- Stop All Jobs Tests ---
    describe('stopAllJobs', () => {
        it('should call stop() on all scheduled jobs and clear the map', () => {
            const campaign1 = createMockCampaign('c9', 'Scheduled', new Date(Date.now() + 60000));
            const campaign2 = createMockCampaign('c10', 'Scheduled', new Date(Date.now() + 120000));

            schedulerService.scheduleCampaignJob(campaign1);
            const task1 = vi.mocked(cron.schedule).mock.results[0]?.value;
            schedulerService.scheduleCampaignJob(campaign2);
            const task2 = vi.mocked(cron.schedule).mock.results[1]?.value;

            const internalJobsMap = (schedulerService as any).scheduledJobs as Map<string, any>;
            expect(internalJobsMap.size).toBe(2);

            schedulerService.stopAllJobs();

            expect(task1.stop).toHaveBeenCalledTimes(1);
            expect(task2.stop).toHaveBeenCalledTimes(1);
            expect(internalJobsMap.size).toBe(0);
        });
    });
});