import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CampaignRunnerService } from './campaignRunner';
import { WahaApiClient } from './wahaClient'; // Import for mocking
import type { PrismaClient, Campaign, Contact, MessageTemplate, MediaLibraryItem, ContactList, WahaSession } from '@prisma/client';
import * as fs from 'fs/promises'; // Import for mocking

// --- Mock Dependencies ---
vi.mock('./wahaClient'); // Mock the entire WahaApiClient module
vi.mock('fs/promises'); // Mock the fs/promises module

const mockWahaApiClient = {
    sendTextMessage: vi.fn(),
    sendImageMessage: vi.fn(),
    // Add other methods if needed by tests
};

const mockFs = {
    readFile: vi.fn(),
};

// --- Mock Prisma Client ---
const mockDb = {
    campaign: {
        findUnique: vi.fn(),
        update: vi.fn(),
    },
    contact: {
        findMany: vi.fn(),
    },
    wahaSession: { // Add mock for WahaSession
        findUnique: vi.fn(),
    },
};

// --- Mock Data Factories ---
const createMockWahaSession = (overrides: Partial<WahaSession> = {}): WahaSession => ({
    id: 'waha-session-1',
    userId: 'user-1',
    sessionName: 'default',
    status: 'WORKING',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
});

const createMockMediaItem = (overrides: Partial<MediaLibraryItem> = {}): MediaLibraryItem => ({
    id: 'media-1',
    userId: 'user-1',
    filename: 'image.jpg',
    storagePath: '/uploads/image.jpg',
    mimeType: 'image/jpeg',
    createdAt: new Date(),
    ...overrides,
});

const createMockCampaign = (overrides: Partial<Campaign & { contactList: ContactList, messageTemplate: MessageTemplate, mediaLibraryItem: MediaLibraryItem | null }> = {}): Campaign & { contactList: ContactList, messageTemplate: MessageTemplate, mediaLibraryItem: MediaLibraryItem | null } => ({
    id: 'campaign-1',
    userId: 'user-1',
    name: 'Test Campaign',
    contactListId: 'list-1',
    messageTemplateId: 'template-1',
    mediaLibraryItemId: null,
    defaultNameValue: 'Customer',
    scheduledAt: new Date(),
    status: 'Scheduled', // Default status for tests
    totalContacts: 0, // Will be set by contact list mock usually
    sentCount: 0,
    failedCount: 0,
    lastProcessedContactIndex: null,
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
    contactList: { id: 'list-1', userId: 'user-1', name: 'Test List', contactCount: 2, createdAt: new Date() },
    messageTemplate: { id: 'template-1', userId: 'user-1', name: 'Test Template', textContent: 'Hello {Name}!', createdAt: new Date(), updatedAt: new Date() },
    mediaLibraryItem: null,
    ...overrides,
});

const createMockContact = (overrides: Partial<Contact> = {}): Contact => ({
    id: `contact-${Math.random()}`,
    contactListId: 'list-1',
    phoneNumber: '1234567890',
    firstName: 'John',
    ...overrides,
});

// --- Test Suite ---
describe('CampaignRunnerService', () => {
    let service: CampaignRunnerService;
    const campaignId = 'campaign-1';
    const mockSessionName = 'default';
    const mockWahaSessionData = createMockWahaSession({ sessionName: mockSessionName });

    beforeEach(() => {
        // Reset mocks before each test
        vi.resetAllMocks();

        // Mock WahaApiClient constructor and methods
        vi.mocked(WahaApiClient).mockImplementation(() => mockWahaApiClient as unknown as WahaApiClient);
        mockWahaApiClient.sendTextMessage.mockResolvedValue({ messageId: 'msg-1' }); // Default success
        mockWahaApiClient.sendImageMessage.mockResolvedValue({ messageId: 'msg-2' }); // Default success

        // Mock fs.readFile
        vi.mocked(fs.readFile).mockImplementation(mockFs.readFile);
        mockFs.readFile.mockResolvedValue(Buffer.from('mock-image-data')); // Default success

        // Create a new service instance with mock dependencies
        service = new CampaignRunnerService(
            mockDb as unknown as PrismaClient,
            new WahaApiClient() // Instance uses the mocked implementation
        );

        // Mock console logging
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        // Default mock for wahaSession findUnique
        mockDb.wahaSession.findUnique.mockResolvedValue(mockWahaSessionData);
        // Default mock for campaign updates
        mockDb.campaign.update.mockResolvedValue({});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // --- Test Cases ---

    it('should successfully run a scheduled text-only campaign and mark it as Completed', async () => {
        const mockCampaign = createMockCampaign({ status: 'Scheduled' });
        const mockContacts = [
            createMockContact({ id: 'c1', firstName: 'Alice', phoneNumber: '111' }),
            createMockContact({ id: 'c2', firstName: 'Bob', phoneNumber: '222' }),
        ];
        mockDb.campaign.findUnique.mockResolvedValue(mockCampaign);
        mockDb.contact.findMany.mockResolvedValue(mockContacts);

        await service.runCampaign(campaignId);

        // Check Waha Session fetch
        expect(mockDb.wahaSession.findUnique).toHaveBeenCalledWith({
            where: { userId: mockCampaign.userId },
            select: { sessionName: true }
        });

        // Check initial status update
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: campaignId },
            data: { status: 'Running', startedAt: expect.any(Date) },
        }));

        // Check WAHA API calls
        expect(mockWahaApiClient.sendTextMessage).toHaveBeenCalledTimes(2);
        expect(mockWahaApiClient.sendTextMessage).toHaveBeenCalledWith(mockSessionName, '111@c.us', 'Hello Alice!');
        expect(mockWahaApiClient.sendTextMessage).toHaveBeenCalledWith(mockSessionName, '222@c.us', 'Hello Bob!');

        // Check sentCount updates
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: campaignId },
            data: { sentCount: { increment: 1 } },
        }));
        expect(mockDb.campaign.update).toHaveBeenCalledTimes(1 + mockContacts.length * 2); // Running + 2x(sentCount + index) + Completed

        // Check index updates
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({ data: { lastProcessedContactIndex: 0 } }));
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({ data: { lastProcessedContactIndex: 1 } }));

        // Check final status update
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: campaignId },
            data: { status: 'Completed', completedAt: expect.any(Date), lastProcessedContactIndex: null },
        }));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Run finished successfully.'));
        expect(mockDb.campaign.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { failedCount: { increment: 1 } } }));
    });

     it('should successfully run a scheduled campaign with an image', async () => {
        const mockMedia = createMockMediaItem({ storagePath: '/path/to/image.png', mimeType: 'image/png', filename: 'nice-pic.png' });
        const mockCampaign = createMockCampaign({ status: 'Scheduled', mediaLibraryItemId: mockMedia.id, mediaLibraryItem: mockMedia });
        const mockContacts = [createMockContact({ id: 'c1', firstName: 'Charlie', phoneNumber: '333' })];
        const mockImageData = Buffer.from('fake-png-data');
        const mockImageBase64 = mockImageData.toString('base64');

        mockDb.campaign.findUnique.mockResolvedValue(mockCampaign);
        mockDb.contact.findMany.mockResolvedValue(mockContacts);
        mockFs.readFile.mockResolvedValue(mockImageData); // Mock file read

        await service.runCampaign(campaignId);

        // Check file read
        expect(mockFs.readFile).toHaveBeenCalledWith(mockMedia.storagePath);

        // Check WAHA API call
        expect(mockWahaApiClient.sendImageMessage).toHaveBeenCalledTimes(1);
        expect(mockWahaApiClient.sendImageMessage).toHaveBeenCalledWith(
            mockSessionName,
            '333@c.us',
            {
                filename: mockMedia.filename,
                base64: mockImageBase64,
                mimeType: mockMedia.mimeType,
            },
            'Hello Charlie!' // Caption
        );
        expect(mockWahaApiClient.sendTextMessage).not.toHaveBeenCalled();

        // Check sentCount update
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
            data: { sentCount: { increment: 1 } },
        }));
        expect(mockDb.campaign.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { failedCount: { increment: 1 } } }));

         // Check final status update
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
            data: { status: 'Completed', completedAt: expect.any(Date), lastProcessedContactIndex: null },
        }));
    });

    it('should use defaultNameValue when firstName is null or empty', async () => {
        const mockCampaign = createMockCampaign({ status: 'Scheduled', defaultNameValue: 'Valued Customer' });
        const mockContacts = [
            createMockContact({ id: 'c1', firstName: null, phoneNumber: '111' }),
            createMockContact({ id: 'c2', firstName: '   ', phoneNumber: '222' }), // Whitespace only
        ];
        mockDb.campaign.findUnique.mockResolvedValue(mockCampaign);
        mockDb.contact.findMany.mockResolvedValue(mockContacts);

        await service.runCampaign(campaignId);

        expect(mockWahaApiClient.sendTextMessage).toHaveBeenCalledWith(mockSessionName, '111@c.us', 'Hello Valued Customer!');
        expect(mockWahaApiClient.sendTextMessage).toHaveBeenCalledWith(mockSessionName, '222@c.us', 'Hello Valued Customer!');
    });

    it('should resume from lastProcessedContactIndex', async () => {
        const mockCampaign = createMockCampaign({ status: 'Scheduled', lastProcessedContactIndex: 1 }); // Start from index 1 (Bob)
        const mockContacts = [
            createMockContact({ id: 'c1', firstName: 'Alice', phoneNumber: '111' }),
            createMockContact({ id: 'c2', firstName: 'Bob', phoneNumber: '222' }),
            createMockContact({ id: 'c3', firstName: 'Charlie', phoneNumber: '333' }),
        ];
        mockDb.campaign.findUnique.mockResolvedValue(mockCampaign);
        mockDb.contact.findMany.mockResolvedValue(mockContacts);

        await service.runCampaign(campaignId);

        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Starting process from index 1.'));
        expect(mockWahaApiClient.sendTextMessage).not.toHaveBeenCalledWith(expect.anything(), '111@c.us', expect.anything()); // Should skip Alice
        expect(mockWahaApiClient.sendTextMessage).toHaveBeenCalledWith(mockSessionName, '222@c.us', 'Hello Bob!');
        expect(mockWahaApiClient.sendTextMessage).toHaveBeenCalledWith(mockSessionName, '333@c.us', 'Hello Charlie!');

        // Check index updates started from the correct point
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({ data: { lastProcessedContactIndex: 1 } }));
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({ data: { lastProcessedContactIndex: 2 } }));

        // Check final status update
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
            data: { status: 'Completed', completedAt: expect.any(Date), lastProcessedContactIndex: null },
        }));
    });

    it('should handle campaigns with no contacts and mark as Completed', async () => {
        const mockCampaign = createMockCampaign({ status: 'Scheduled' });
        mockDb.campaign.findUnique.mockResolvedValue(mockCampaign);
        mockDb.contact.findMany.mockResolvedValue([]); // Empty list

        await service.runCampaign(campaignId);

        expect(mockDb.wahaSession.findUnique).toHaveBeenCalled(); // Still checks session
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('No contacts found in the list. Marking as completed.'));
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'Running', startedAt: expect.any(Date) } }));
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'Completed', completedAt: expect.any(Date), lastProcessedContactIndex: null } }));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Run finished due to empty contact list.'));
        expect(mockWahaApiClient.sendTextMessage).not.toHaveBeenCalled();
        expect(mockWahaApiClient.sendImageMessage).not.toHaveBeenCalled();
        expect(mockDb.campaign.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { lastProcessedContactIndex: expect.any(Number) } }));
    });

    it('should return early if campaign status is not Scheduled', async () => {
        const mockCampaign = createMockCampaign({ status: 'Running' }); // Invalid initial state
        mockDb.campaign.findUnique.mockResolvedValue(mockCampaign);

        await service.runCampaign(campaignId);

        expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Campaign is not in 'Scheduled' state (current: Running). Aborting run."));
        expect(mockDb.wahaSession.findUnique).not.toHaveBeenCalled(); // Should not check session
        expect(mockDb.campaign.update).not.toHaveBeenCalled();
        expect(mockDb.contact.findMany).not.toHaveBeenCalled();
    });

    it('should fail campaign early if no WahaSession is found for the user', async () => {
        const mockCampaign = createMockCampaign({ status: 'Scheduled' });
        mockDb.campaign.findUnique.mockResolvedValue(mockCampaign);
        mockDb.wahaSession.findUnique.mockResolvedValue(null); // No session found

        await service.runCampaign(campaignId);

        expect(console.error).toHaveBeenCalledWith(expect.stringContaining(`No active WAHA session found for user ${mockCampaign.userId}. Marking campaign as Failed.`));
        expect(mockDb.campaign.update).toHaveBeenCalledTimes(1); // Only the Failed update
        expect(mockDb.campaign.update).toHaveBeenCalledWith({
            where: { id: campaignId },
            data: { status: 'Failed', completedAt: expect.any(Date) },
        });
        expect(mockDb.contact.findMany).not.toHaveBeenCalled(); // Should not proceed
        expect(mockWahaApiClient.sendTextMessage).not.toHaveBeenCalled();
    });

    it('should increment failedCount and continue if sendTextMessage fails', async () => {
        const mockCampaign = createMockCampaign({ status: 'Scheduled' });
        const mockContacts = [
            createMockContact({ id: 'c1', phoneNumber: '111' }),
            createMockContact({ id: 'c2', phoneNumber: '222' }),
        ];
        const apiError = new Error('WAHA API unavailable');
        mockDb.campaign.findUnique.mockResolvedValue(mockCampaign);
        mockDb.contact.findMany.mockResolvedValue(mockContacts);
        mockWahaApiClient.sendTextMessage
            .mockRejectedValueOnce(apiError) // First call fails
            .mockResolvedValue({ messageId: 'msg-ok' }); // Second call succeeds

        await service.runCampaign(campaignId);

        expect(mockWahaApiClient.sendTextMessage).toHaveBeenCalledTimes(2);
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining(`Failed to send message to 111@c.us:`), apiError);
        // Check failedCount update for the first contact
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
            data: { failedCount: { increment: 1 } },
        }));
        // Check sentCount update for the second contact
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
            data: { sentCount: { increment: 1 } },
        }));
        // Check final status update is still Completed
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
            data: { status: 'Completed', completedAt: expect.any(Date), lastProcessedContactIndex: null },
        }));
    });

    it('should increment failedCount and continue if readFile fails for an image campaign', async () => {
        const mockMedia = createMockMediaItem({ storagePath: '/bad/path.jpg' });
        const mockCampaign = createMockCampaign({ status: 'Scheduled', mediaLibraryItemId: mockMedia.id, mediaLibraryItem: mockMedia });
        const mockContacts = [createMockContact({ id: 'c1', phoneNumber: '111' })];
        const readError = new Error('File not found');
        mockDb.campaign.findUnique.mockResolvedValue(mockCampaign);
        mockDb.contact.findMany.mockResolvedValue(mockContacts);
        mockFs.readFile.mockRejectedValue(readError); // Mock file read failure

        await service.runCampaign(campaignId);

        expect(mockFs.readFile).toHaveBeenCalledWith(mockMedia.storagePath);
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining(`Failed to read media file ${mockMedia.storagePath}:`), readError);
        expect(mockWahaApiClient.sendImageMessage).not.toHaveBeenCalled(); // API should not be called
        // Check failedCount update
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
            data: { failedCount: { increment: 1 } },
        }));
        expect(mockDb.campaign.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { sentCount: { increment: 1 } } }));
        // Check final status update is still Completed
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
            data: { status: 'Completed', completedAt: expect.any(Date), lastProcessedContactIndex: null },
        }));
    });

     it('should increment failedCount and continue if sendImageMessage fails', async () => {
        const mockMedia = createMockMediaItem();
        const mockCampaign = createMockCampaign({ status: 'Scheduled', mediaLibraryItemId: mockMedia.id, mediaLibraryItem: mockMedia });
        const mockContacts = [createMockContact({ id: 'c1', phoneNumber: '111' })];
        const apiError = new Error('WAHA Image API error');
        mockDb.campaign.findUnique.mockResolvedValue(mockCampaign);
        mockDb.contact.findMany.mockResolvedValue(mockContacts);
        mockFs.readFile.mockResolvedValue(Buffer.from('img')); // File read succeeds
        mockWahaApiClient.sendImageMessage.mockRejectedValue(apiError); // API call fails

        await service.runCampaign(campaignId);

        expect(mockFs.readFile).toHaveBeenCalled();
        expect(mockWahaApiClient.sendImageMessage).toHaveBeenCalledTimes(1);
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining(`Failed to send message to 111@c.us:`), apiError);
        // Check failedCount update
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
            data: { failedCount: { increment: 1 } },
        }));
        expect(mockDb.campaign.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { sentCount: { increment: 1 } } }));
        // Check final status update is still Completed
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
            data: { status: 'Completed', completedAt: expect.any(Date), lastProcessedContactIndex: null },
        }));
    });

    // --- Tests for Critical Errors (unchanged logic, but verify mocks don't interfere) ---

    it('should mark campaign as Failed on critical DB error during loop', async () => {
        // This test ensures the main try/catch still works as expected
        const mockCampaign = createMockCampaign({ status: 'Scheduled' });
        const mockContacts = [createMockContact({ id: 'c1' })];
        const dbError = new Error('Database connection lost');

        mockDb.campaign.findUnique.mockResolvedValue(mockCampaign);
        mockDb.contact.findMany.mockResolvedValue(mockContacts);
        mockWahaApiClient.sendTextMessage.mockResolvedValue({}); // API call succeeds
        // First update (Running) succeeds
        mockDb.campaign.update.mockResolvedValueOnce({});
         // Second update (sentCount) succeeds
        mockDb.campaign.update.mockResolvedValueOnce({});
        // Third update (index update) fails critically
        mockDb.campaign.update.mockRejectedValueOnce(dbError);

        await service.runCampaign(campaignId);

        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('CRITICAL ERROR during run:'), dbError);
        // Check final status update to Failed (this is the 4th update call)
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: campaignId },
            data: { status: 'Failed', completedAt: expect.any(Date) }, // Keep lastProcessedContactIndex
        }));
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Status updated to Failed.'));
    });

     it('should log error and return if campaign is not found', async () => {
        mockDb.campaign.findUnique.mockResolvedValue(null); // Campaign not found

        await service.runCampaign(campaignId);

        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Campaign not found.'));
        expect(mockDb.wahaSession.findUnique).not.toHaveBeenCalled();
        expect(mockDb.campaign.update).not.toHaveBeenCalled();
        expect(mockDb.contact.findMany).not.toHaveBeenCalled();
    });

     it('should handle error during final "Completed" status update', async () => {
        const mockCampaign = createMockCampaign({ status: 'Scheduled' });
        const mockContacts = [createMockContact({ id: 'c1' })];
        const dbError = new Error('Failed final update');

        mockDb.campaign.findUnique.mockResolvedValue(mockCampaign);
        mockDb.contact.findMany.mockResolvedValue(mockContacts);
        mockWahaApiClient.sendTextMessage.mockResolvedValue({}); // API call succeeds

        // Running update succeeds
        mockDb.campaign.update.mockResolvedValueOnce({});
        // sentCount update succeeds
        mockDb.campaign.update.mockResolvedValueOnce({});
        // Index update succeeds
        mockDb.campaign.update.mockResolvedValueOnce({});
         // Final Completed update fails
        mockDb.campaign.update.mockRejectedValueOnce(dbError);

        await service.runCampaign(campaignId);

        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('CRITICAL ERROR during run:'), dbError);
        // Should attempt to mark as Failed (5th update call)
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: campaignId },
            data: { status: 'Failed', completedAt: expect.any(Date) },
        }));
    });

     it('should handle error when updating status to Failed', async () => {
        const mockCampaign = createMockCampaign({ status: 'Scheduled' });
        const mockContacts = [createMockContact({ id: 'c1' })];
        const initialError = new Error('Error during loop');
        const finalError = new Error('Failed to update status to Failed');

        mockDb.campaign.findUnique.mockResolvedValue(mockCampaign);
        mockDb.contact.findMany.mockResolvedValue(mockContacts);
        mockWahaApiClient.sendTextMessage.mockResolvedValue({}); // API call succeeds

        // Running update succeeds
        mockDb.campaign.update.mockResolvedValueOnce({});
        // sentCount update succeeds
        mockDb.campaign.update.mockResolvedValueOnce({});
        // Index update fails, triggering the catch block
        mockDb.campaign.update.mockRejectedValueOnce(initialError);
        // The subsequent update to 'Failed' also fails
        mockDb.campaign.update.mockRejectedValueOnce(finalError);

        await service.runCampaign(campaignId);

        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('CRITICAL ERROR during run:'), initialError);
        // Check it attempts the Failed update (4th update call)
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: campaignId },
            data: { status: 'Failed', completedAt: expect.any(Date) },
        }));
        // Check it logs the secondary failure
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('FAILED TO UPDATE STATUS TO FAILED after critical error:'), finalError);
    });
});