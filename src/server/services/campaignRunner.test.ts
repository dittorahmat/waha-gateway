import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CampaignRunnerService } from './campaignRunner';
import type { PrismaClient, Campaign, Contact, MessageTemplate, MediaLibraryItem, ContactList } from '@prisma/client';
import { TRPCError } from '@trpc/server'; // Although not thrown by service, good practice

// --- Mock Prisma Client ---
// We mock the specific methods used by the service
const mockDb = {
    campaign: {
        findUnique: vi.fn(),
        update: vi.fn(),
    },
    contact: {
        findMany: vi.fn(),
    },
    // Add other models if the service expands its scope
};

// --- Mock Data Factories ---
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

    beforeEach(() => {
        // Reset mocks before each test
        vi.resetAllMocks();
        // Create a new service instance with the mock DB
        // Need to cast because our mock doesn't fully implement PrismaClient
        service = new CampaignRunnerService(mockDb as unknown as PrismaClient);
        // Mock console logging to check output
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        // Restore console mocks
        vi.restoreAllMocks();
    });

    // --- Test Cases ---

    it('should successfully run a scheduled campaign and mark it as Completed', async () => {
        const mockCampaign = createMockCampaign({ status: 'Scheduled' });
        const mockContacts = [
            createMockContact({ id: 'c1', firstName: 'Alice' }),
            createMockContact({ id: 'c2', firstName: 'Bob' }),
        ];
        mockDb.campaign.findUnique.mockResolvedValue(mockCampaign);
        mockDb.contact.findMany.mockResolvedValue(mockContacts);
        mockDb.campaign.update.mockResolvedValue({}); // Mock update calls

        await service.runCampaign(campaignId);

        // Check initial status update
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: campaignId },
            data: { status: 'Running', startedAt: expect.any(Date) },
        }));

        // Check contact processing logs
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Would send to 1234567890: "Hello Alice!"'));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Would send to 1234567890: "Hello Bob!"'));

        // Check index updates
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: campaignId },
            data: { lastProcessedContactIndex: 0 },
        }));
         expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: campaignId },
            data: { lastProcessedContactIndex: 1 },
        }));

        // Check final status update
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: campaignId },
            data: { status: 'Completed', completedAt: expect.any(Date), lastProcessedContactIndex: null },
        }));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Run finished successfully.'));
    });

    it('should use defaultNameValue when firstName is null or empty', async () => {
        const mockCampaign = createMockCampaign({ status: 'Scheduled', defaultNameValue: 'Valued Customer' });
        const mockContacts = [
            createMockContact({ id: 'c1', firstName: null }),
            createMockContact({ id: 'c2', firstName: '   ' }), // Whitespace only
        ];
        mockDb.campaign.findUnique.mockResolvedValue(mockCampaign);
        mockDb.contact.findMany.mockResolvedValue(mockContacts);
        mockDb.campaign.update.mockResolvedValue({});

        await service.runCampaign(campaignId);

        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Would send to 1234567890: "Hello Valued Customer!"'));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Would send to 1234567890: "Hello Valued Customer!"')); // Second one too
    });

     it('should include media path in log when mediaLibraryItemId is set', async () => {
        const mockMediaItem: MediaLibraryItem = { id: 'media-1', userId: 'user-1', filename: 'image.jpg', storagePath: '/uploads/image.jpg', mimeType: 'image/jpeg', createdAt: new Date() };
        const mockCampaign = createMockCampaign({
            status: 'Scheduled',
            mediaLibraryItemId: 'media-1',
            mediaLibraryItem: mockMediaItem
        });
        const mockContacts = [createMockContact({ id: 'c1', firstName: 'Alice' })];
        mockDb.campaign.findUnique.mockResolvedValue(mockCampaign);
        mockDb.contact.findMany.mockResolvedValue(mockContacts);
        mockDb.campaign.update.mockResolvedValue({});

        await service.runCampaign(campaignId);

        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('with media /uploads/image.jpg'));
    });

    it('should resume from lastProcessedContactIndex', async () => {
        const mockCampaign = createMockCampaign({ status: 'Scheduled', lastProcessedContactIndex: 1 }); // Start from index 1 (Bob)
        const mockContacts = [
            createMockContact({ id: 'c1', firstName: 'Alice' }),
            createMockContact({ id: 'c2', firstName: 'Bob' }),
            createMockContact({ id: 'c3', firstName: 'Charlie' }),
        ];
        mockDb.campaign.findUnique.mockResolvedValue(mockCampaign);
        mockDb.contact.findMany.mockResolvedValue(mockContacts);
        mockDb.campaign.update.mockResolvedValue({});

        await service.runCampaign(campaignId);

        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Starting process from index 1.'));
        expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Hello Alice!')); // Should skip Alice
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Hello Bob!'));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Hello Charlie!'));

        // Check index updates started from the correct point
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({ data: { lastProcessedContactIndex: 1 } }));
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({ data: { lastProcessedContactIndex: 2 } }));

        // Check final status update - be specific about the expected data
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: campaignId },
            data: { status: 'Completed', completedAt: expect.any(Date), lastProcessedContactIndex: null },
        }));
    });

    it('should handle campaigns with no contacts and mark as Completed', async () => {
        const mockCampaign = createMockCampaign({ status: 'Scheduled' });
        mockDb.campaign.findUnique.mockResolvedValue(mockCampaign);
        mockDb.contact.findMany.mockResolvedValue([]); // Empty list
        mockDb.campaign.update.mockResolvedValue({});

        await service.runCampaign(campaignId);

        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('No contacts found in the list. Marking as completed.'));
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
             where: { id: campaignId },
             data: { status: 'Running', startedAt: expect.any(Date) }, // Still marks as running first
        }));
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: campaignId },
            data: { status: 'Completed', completedAt: expect.any(Date), lastProcessedContactIndex: null },
        }));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Run finished due to empty contact list.'));
        expect(mockDb.campaign.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { lastProcessedContactIndex: expect.any(Number) } })); // No index updates
    });

    it('should return early if campaign status is not Scheduled', async () => {
        const mockCampaign = createMockCampaign({ status: 'Running' }); // Invalid initial state
        mockDb.campaign.findUnique.mockResolvedValue(mockCampaign);

        await service.runCampaign(campaignId);

        expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Campaign is not in 'Scheduled' state (current: Running). Aborting run."));
        expect(mockDb.campaign.update).not.toHaveBeenCalled(); // Should not update status
        expect(mockDb.contact.findMany).not.toHaveBeenCalled(); // Should not fetch contacts
    });

    it('should mark campaign as Failed on internal error during loop', async () => {
        const mockCampaign = createMockCampaign({ status: 'Scheduled' });
        const mockContacts = [createMockContact({ id: 'c1' })];
        const dbError = new Error('Database connection lost');

        mockDb.campaign.findUnique.mockResolvedValue(mockCampaign);
        mockDb.contact.findMany.mockResolvedValue(mockContacts);
        // First update (to Running) succeeds
        mockDb.campaign.update.mockResolvedValueOnce({});
        // Second update (index update) fails
        mockDb.campaign.update.mockRejectedValueOnce(dbError);

        await service.runCampaign(campaignId);

        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('CRITICAL ERROR during run:'), dbError);
        // Check final status update to Failed
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: campaignId },
            data: { status: 'Failed', completedAt: expect.any(Date) },
        }));
         expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Status updated to Failed.'));
    });

     it('should log error and return if campaign is not found', async () => {
        mockDb.campaign.findUnique.mockResolvedValue(null); // Campaign not found

        await service.runCampaign(campaignId);

        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Campaign not found.'));
        expect(mockDb.campaign.update).not.toHaveBeenCalled();
        expect(mockDb.contact.findMany).not.toHaveBeenCalled();
    });

     it('should handle error during final "Completed" status update', async () => {
        const mockCampaign = createMockCampaign({ status: 'Scheduled' });
        const mockContacts = [createMockContact({ id: 'c1' })];
        const dbError = new Error('Failed final update');

        mockDb.campaign.findUnique.mockResolvedValue(mockCampaign);
        mockDb.contact.findMany.mockResolvedValue(mockContacts);
        // Running update succeeds
        mockDb.campaign.update.mockResolvedValueOnce({});
        // Index update succeeds
        mockDb.campaign.update.mockResolvedValueOnce({});
         // Final Completed update fails
        mockDb.campaign.update.mockRejectedValueOnce(dbError);

        await service.runCampaign(campaignId);

        // Should still log the critical error from the catch block
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('CRITICAL ERROR during run:'), dbError);
        // Should attempt to mark as Failed
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
        // Running update succeeds
        mockDb.campaign.update.mockResolvedValueOnce({});
        // Index update fails, triggering the catch block
        mockDb.campaign.update.mockRejectedValueOnce(initialError);
        // The subsequent update to 'Failed' also fails
        mockDb.campaign.update.mockRejectedValueOnce(finalError);


        await service.runCampaign(campaignId);


        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('CRITICAL ERROR during run:'), initialError);
        // Check it attempts the Failed update (which is the 3rd update call in this scenario)
        // The data should include both status and completedAt
        expect(mockDb.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: campaignId },
            data: { status: 'Failed', completedAt: expect.any(Date) },
        }));
        // Check it logs the secondary failure
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('FAILED TO UPDATE STATUS TO FAILED after critical error:'), finalError);
    });


});