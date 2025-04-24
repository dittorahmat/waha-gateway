// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"; // Added vi
import { type AppRouter, appRouter } from "~/server/api/root";
import { createCallerFactory } from "~/server/api/trpc";
import { type Session } from "next-auth";
import { db } from '../../db';
import { type ContactList, type MessageTemplate, type MediaLibraryItem, type Campaign } from "@prisma/client"; // Removed CampaignStatus import
import { TRPCError } from "@trpc/server";
import { CampaignRunnerService } from "~/server/services/campaignRunner"; // Import the actual service

// Mock CampaignRunnerService
const mockRunCampaign = vi.fn();
vi.mock("~/server/services/campaignRunner", () => {
  // Mock the constructor and the method we need to control
  return {
    CampaignRunnerService: vi.fn().mockImplementation(() => {
      return {
        runCampaign: mockRunCampaign,
      };
    }),
  };
});


// Mock session data
const testUserId = "campaign-test-user-id";
const otherUserId = "campaign-other-user-id";
const mockSession: Session = {
  user: { id: testUserId, name: "Campaign Test User", email: "campaign-test@example.com" },
  expires: "1",
};

// Create a caller instance with mocked context
const createCaller = createCallerFactory(appRouter);
const caller = createCaller({
  session: mockSession,
  db: db, // Use the actual db instance for integration tests
  headers: new Headers(),
});

// Helper data variables
let testUserContactList: ContactList;
let testUserTemplate: MessageTemplate;
let testUserMediaItem: MediaLibraryItem;
let otherUserContactList: ContactList;
let otherUserTemplate: MessageTemplate;
let otherUserMediaItem: MediaLibraryItem;

// Helper function to clean up test data
const cleanupTestData = async () => {
  // Delete campaigns first due to dependencies
  await db.campaign.deleteMany({
    where: { userId: { in: [testUserId, otherUserId] } },
  });
  // Delete related items
  await db.mediaLibraryItem.deleteMany({
    where: { userId: { in: [testUserId, otherUserId] } },
  });
  await db.messageTemplate.deleteMany({
    where: { userId: { in: [testUserId, otherUserId] } },
  });
   // Delete contacts before lists
  await db.contact.deleteMany({
    where: { contactList: { userId: { in: [testUserId, otherUserId] } } },
  });
  await db.contactList.deleteMany({
    where: { userId: { in: [testUserId, otherUserId] } },
  });
  // Delete users
  await db.user.deleteMany({
    where: { id: { in: [testUserId, otherUserId] } },
  }).catch(() => {}); // Ignore errors if users don't exist
};

// Helper to generate a random CUID-like string for testing non-existence
// Note: Prisma CUIDs start with 'c', so we mimic that loosely.
// A more robust approach might use a CUID library if strict format is needed.
const generateNonExistentCuid = () => `c${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;

describe("Campaign Router", () => {
  // Setup/Teardown for the entire suite
  beforeAll(async () => {
    // Clean up any potential leftovers from previous failed runs
    await cleanupTestData();

    // Create test users
    await db.user.createMany({
      data: [
        { id: testUserId, email: "campaign-test@example.com", name: "Campaign Test User" },
        { id: otherUserId, email: "campaign-other@example.com", name: "Other User" },
      ],
      skipDuplicates: true, // Skip if users already exist
    });

    // Create necessary related data for the main test user
    testUserContactList = await db.contactList.create({
      data: { userId: testUserId, name: "Test List 1", contactCount: 10 },
    });
    testUserTemplate = await db.messageTemplate.create({
      data: { userId: testUserId, name: "Test Template 1", textContent: "Hello {Name}" },
    });
    testUserMediaItem = await db.mediaLibraryItem.create({
      data: { userId: testUserId, filename: "test.jpg", storagePath: "/test/test.jpg", mimeType: "image/jpeg" },
    });

    // Create related data for the 'other' user (for ownership tests)
    otherUserContactList = await db.contactList.create({
      data: { userId: otherUserId, name: "Other List", contactCount: 5 },
    });
     otherUserTemplate = await db.messageTemplate.create({
      data: { userId: otherUserId, name: "Other Template", textContent: "Hi" },
    });
    otherUserMediaItem = await db.mediaLibraryItem.create({
      data: { userId: otherUserId, filename: "other.png", storagePath: "/other/other.png", mimeType: "image/png" },
    });
  });

  afterAll(async () => {
    // Final cleanup
    await cleanupTestData();
  });

  // Clean up campaigns before each specific test
  beforeEach(async () => {
    await db.campaign.deleteMany({
      where: { userId: { in: [testUserId, otherUserId] } },
    });
    // Reset mocks before each test
    vi.clearAllMocks();
    mockRunCampaign.mockClear();
  });

  // --- campaign.create Tests ---

  it("should create a new campaign without media", async () => {
    const input = {
      name: "Summer Sale",
      contactListId: testUserContactList.id,
      messageTemplateId: testUserTemplate.id,
      defaultNameValue: "Valued Customer",
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Schedule for tomorrow
    };
    const result = await caller.campaign.create(input);

    expect(result).toBeDefined();
    expect(result.id).toBeTypeOf("string");
    expect(result.name).toBe(input.name);
    expect(result.userId).toBe(testUserId);
    expect(result.contactListId).toBe(input.contactListId);
    expect(result.messageTemplateId).toBe(input.messageTemplateId);
    expect(result.mediaLibraryItemId).toBeNull();
    expect(result.defaultNameValue).toBe(input.defaultNameValue);
    expect(result.scheduledAt).toEqual(input.scheduledAt);
    expect(result.status).toBe("Scheduled");
    expect(result.totalContacts).toBe(testUserContactList.contactCount); // Verify contact count snapshot
    expect(result.sentCount).toBe(0);
    expect(result.failedCount).toBe(0);

    // Verify in DB
    const dbCampaign = await db.campaign.findUnique({ where: { id: result.id } });
    expect(dbCampaign).not.toBeNull();
    expect(dbCampaign?.name).toBe(input.name);
    expect(dbCampaign?.totalContacts).toBe(testUserContactList.contactCount);
  });

  it("should create a new campaign with media", async () => {
    const input = {
      name: "Promo with Image",
      contactListId: testUserContactList.id,
      messageTemplateId: testUserTemplate.id,
      mediaLibraryItemId: testUserMediaItem.id, // Include media item
      defaultNameValue: "Friend",
      scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // Schedule for 2 days later
    };
    const result = await caller.campaign.create(input);

    expect(result).toBeDefined();
    expect(result.name).toBe(input.name);
    expect(result.userId).toBe(testUserId);
    expect(result.contactListId).toBe(input.contactListId);
    expect(result.messageTemplateId).toBe(input.messageTemplateId);
    expect(result.mediaLibraryItemId).toBe(input.mediaLibraryItemId); // Verify media ID
    expect(result.defaultNameValue).toBe(input.defaultNameValue);
    expect(result.scheduledAt).toEqual(input.scheduledAt);
    expect(result.status).toBe("Scheduled");
    expect(result.totalContacts).toBe(testUserContactList.contactCount);
    expect(result.sentCount).toBe(0);
    expect(result.failedCount).toBe(0);

    // Verify in DB
    const dbCampaign = await db.campaign.findUnique({ where: { id: result.id } });
    expect(dbCampaign).not.toBeNull();
    expect(dbCampaign?.mediaLibraryItemId).toBe(input.mediaLibraryItemId);
  });

  // Ownership: Contact List
  it("should fail if the contact list is not owned by the user", async () => {
    const input = {
      name: "Ownership Test",
      contactListId: otherUserContactList.id,
      messageTemplateId: testUserTemplate.id,
      defaultNameValue: "Customer",
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
    await expect(caller.campaign.create(input)).rejects.toThrow(
      expect.objectContaining({
        code: 'NOT_FOUND',
        message: expect.stringContaining('Contact List'),
      })
    );
  });

  // Ownership: Message Template
  it("should fail if the message template is not owned by the user", async () => {
    const input = {
      name: "Ownership Test",
      contactListId: testUserContactList.id,
      messageTemplateId: otherUserTemplate.id,
      defaultNameValue: "Customer",
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
    await expect(caller.campaign.create(input)).rejects.toThrow(
      expect.objectContaining({
        code: 'NOT_FOUND',
        message: expect.stringContaining('Message Template'),
      })
    );
  });

  // Ownership: Media Item
  it("should fail if the media item is not owned by the user", async () => {
    const input = {
      name: "Ownership Test",
      contactListId: testUserContactList.id,
      messageTemplateId: testUserTemplate.id,
      mediaLibraryItemId: otherUserMediaItem.id,
      defaultNameValue: "Customer",
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
    await expect(caller.campaign.create(input)).rejects.toThrow(
      expect.objectContaining({
        code: 'NOT_FOUND',
        message: expect.stringContaining('Media Item'),
      })
    );
  });

  // Not Found: Contact List
  it("should fail if the contact list does not exist", async () => {
    const input = {
      name: "NotFound Test",
      contactListId: generateNonExistentCuid(),
      messageTemplateId: testUserTemplate.id,
      defaultNameValue: "Customer",
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
    await expect(caller.campaign.create(input)).rejects.toThrow(
      expect.objectContaining({
        code: 'NOT_FOUND',
        message: expect.stringContaining('Contact List'),
      })
    );
  });

  // Not Found: Message Template
  it("should fail if the message template does not exist", async () => {
    const input = {
      name: "NotFound Test",
      contactListId: testUserContactList.id,
      messageTemplateId: generateNonExistentCuid(),
      defaultNameValue: "Customer",
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
    await expect(caller.campaign.create(input)).rejects.toThrow(
      expect.objectContaining({
        code: 'NOT_FOUND',
        message: expect.stringContaining('Message Template'),
      })
    );
  });

  // Not Found: Media Item
  it("should fail if the media item does not exist", async () => {
    const input = {
      name: "NotFound Test",
      contactListId: testUserContactList.id,
      messageTemplateId: testUserTemplate.id,
      mediaLibraryItemId: generateNonExistentCuid(),
      defaultNameValue: "Customer",
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
    await expect(caller.campaign.create(input)).rejects.toThrow(
      expect.objectContaining({
        code: 'NOT_FOUND',
        message: expect.stringContaining('Media Item'),
      })
    );
  });

  it("should fail if defaultNameValue is not provided", async () => { // Corrected test name
     const input = {
       name: "Default Name Test",
       contactListId: testUserContactList.id,
       messageTemplateId: testUserTemplate.id,
       scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
       // defaultNameValue is intentionally omitted
     };
     // Use 'input as any' to bypass compile-time check for this specific test
     await expect(caller.campaign.create(input as any)).rejects.toThrow(
       expect.objectContaining({
         code: 'BAD_REQUEST',
         message: expect.stringContaining('defaultNameValue'), // Expect Zod error for missing field
       })
     );
   });

  it("should fail if required fields are missing (Zod validation)", async () => {
    const input = {
      // name is missing
      contactListId: testUserContactList.id,
      messageTemplateId: testUserTemplate.id,
      scheduledAt: new Date(),
      defaultNameValue: "Missing Name Test", // defaultNameValue is present here
    };

    // Need to cast as any because TS knows 'name' is missing
    await expect(caller.campaign.create(input as any)).rejects.toThrow(TRPCError);
    // Check for Zod specific error details
    await expect(caller.campaign.create(input as any)).rejects.toThrow(
      expect.objectContaining({ code: 'BAD_REQUEST', message: expect.stringContaining('"name"') })
    );
  });

  it("should fail if contact list does not exist or belong to user", async () => {
    // Test with a non-existent but valid CUID format
    const nonExistentListId = generateNonExistentCuid();
    const inputNonExistent = {
      name: "Bad List Test - Non Existent",
      contactListId: nonExistentListId,
      messageTemplateId: testUserTemplate.id,
      scheduledAt: new Date(),
    defaultNameValue: "Customer",
    };
    await expect(caller.campaign.create(inputNonExistent)).rejects.toThrow(
      expect.objectContaining({ code: 'NOT_FOUND', message: expect.stringContaining("Selected Contact List not found or access denied.") })
    );

    // Test with a list belonging to another user
    const inputOtherUser = {
      name: "Other User List Test",
      contactListId: otherUserContactList.id, // Belongs to other user
      messageTemplateId: testUserTemplate.id,
      scheduledAt: new Date(),
    defaultNameValue: "Customer",
    };
    await expect(caller.campaign.create(inputOtherUser)).rejects.toThrow(
      expect.objectContaining({ code: 'NOT_FOUND', message: expect.stringContaining("Selected Contact List not found or access denied.") })
    );
  });

  it("should fail if message template does not exist or belong to user", async () => {
    // Test with a non-existent but valid CUID format
    const nonExistentTemplateId = generateNonExistentCuid();
    const inputNonExistent = {
      name: "Bad Template Test - Non Existent",
      contactListId: testUserContactList.id,
      messageTemplateId: nonExistentTemplateId,
      scheduledAt: new Date(),
    defaultNameValue: "Customer",
    };
    await expect(caller.campaign.create(inputNonExistent)).rejects.toThrow(
      expect.objectContaining({ code: 'NOT_FOUND', message: expect.stringContaining("Selected Message Template not found or access denied.") })
    );

    // Test with a template belonging to another user
    const inputOtherUser = {
      name: "Other User Template Test",
      contactListId: testUserContactList.id,
      messageTemplateId: otherUserTemplate.id, // Belongs to other user
      scheduledAt: new Date(),
    defaultNameValue: "Customer",
    };
    await expect(caller.campaign.create(inputOtherUser)).rejects.toThrow(
      expect.objectContaining({ code: 'NOT_FOUND', message: expect.stringContaining("Selected Message Template not found or access denied.") })
    );
  });

   it("should fail if media item does not exist or belong to user (when provided)", async () => {
     // Test with a non-existent but valid CUID format
     const nonExistentMediaId = generateNonExistentCuid();
     const inputNonExistent = {
       name: "Bad Media Test - Non Existent",
       contactListId: testUserContactList.id,
       messageTemplateId: testUserTemplate.id,
       mediaLibraryItemId: nonExistentMediaId,
       scheduledAt: new Date(),
       defaultNameValue: "Customer",
     };
     await expect(caller.campaign.create(inputNonExistent)).rejects.toThrow(
       expect.objectContaining({ code: 'NOT_FOUND', message: expect.stringContaining("Selected Media Item not found or access denied.") })
     );

     // Test with a media item belonging to another user
     const inputOtherUser = {
       name: "Other User Media Test",
       contactListId: testUserContactList.id,
       messageTemplateId: testUserTemplate.id,
       mediaLibraryItemId: otherUserMediaItem.id, // Belongs to other user
       scheduledAt: new Date(),
       defaultNameValue: "Customer",
     };
     await expect(caller.campaign.create(inputOtherUser)).rejects.toThrow(
       expect.objectContaining({ code: 'NOT_FOUND', message: expect.stringContaining("Selected Media Item not found or access denied.") })
     );
   });

  // --- campaign.list Tests ---
  describe("campaign.list", () => {
    it("should list campaigns belonging to the user (default pagination)", async () => {
        // Create a couple of campaigns for the test user
        const campaign1 = await db.campaign.create({
            data: {
                userId: testUserId,
                name: "List Test Campaign 1",
                contactListId: testUserContactList.id,
                messageTemplateId: testUserTemplate.id,
                defaultNameValue: "Customer",
                scheduledAt: new Date(),
                status: "Scheduled",
                totalContacts: 10, sentCount: 0, failedCount: 0,
            }
        });
        const campaign2 = await db.campaign.create({
            data: {
                userId: testUserId,
                name: "List Test Campaign 2",
                contactListId: testUserContactList.id,
                messageTemplateId: testUserTemplate.id,
                defaultNameValue: "Friend",
                scheduledAt: new Date(Date.now() - 86400000), // Yesterday
                status: "Completed",
                totalContacts: 5, sentCount: 5, failedCount: 0,
            }
        });
         // Create a campaign for the other user (should not be listed)
        await db.campaign.create({
            data: {
                userId: otherUserId,
                name: "Other User Campaign",
                contactListId: otherUserContactList.id,
                messageTemplateId: otherUserTemplate.id,
                defaultNameValue: "Client",
                scheduledAt: new Date(),
                status: "Scheduled",
                totalContacts: 1, sentCount: 0, failedCount: 0,
            }
        });

        // Call list with default pagination (page 1, pageSize 10)
        const result = await caller.campaign.list({}); // Pass empty object for default input

        expect(result).toBeDefined();
        expect(result.campaigns).toBeInstanceOf(Array);
        expect(result.totalCount).toBe(2); // Total count for the user
        expect(result.campaigns.length).toBe(2); // Only the test user's campaigns returned on page 1

        // Campaigns are ordered by createdAt desc by default in the procedure
        // Find the created campaigns in the result array (order might depend on exact creation time)
        const names = result.campaigns.map(c => c.name);
        expect(names).toContain("List Test Campaign 1");
        expect(names).toContain("List Test Campaign 2");

        // Ensure all returned campaigns belong to the test user
        expect(result.campaigns.every(c => c.id === campaign1.id || c.id === campaign2.id)).toBe(true);
    });

    it("should return an empty array and zero count if the user has no campaigns", async () => {
        const result = await caller.campaign.list({}); // Pass empty object for default input
        expect(result).toBeDefined();
        expect(result.campaigns).toEqual([]);
        expect(result.totalCount).toBe(0);
    });

    it("should handle pagination correctly", async () => {
      // Create 15 campaigns for the test user with slightly different creation times
      const campaignData = Array.from({ length: 15 }, (_, i) => ({
        userId: testUserId,
        name: `Paginated Campaign ${i + 1}`,
        contactListId: testUserContactList.id,
        messageTemplateId: testUserTemplate.id,
        defaultNameValue: `Cust ${i}`,
        scheduledAt: new Date(Date.now() - i * 1000), // Ensure distinct createdAt
        status: i % 3 === 0 ? 'Scheduled' : (i % 3 === 1 ? 'Running' : 'Completed'),
        totalContacts: 10 + i,
        sentCount: i,
        failedCount: 0,
        createdAt: new Date(Date.now() - i * 1000), // Explicit createdAt for predictable order
      }));
      await db.campaign.createMany({ data: campaignData });

      // Page 1, Size 5
      let result = await caller.campaign.list({ page: 1, pageSize: 5 });
      expect(result.campaigns.length).toBe(5);
      expect(result.totalCount).toBe(15);
      expect(result.campaigns[0]?.name).toBe("Paginated Campaign 1"); // Newest
      expect(result.campaigns[4]?.name).toBe("Paginated Campaign 5");

      // Page 2, Size 5
      result = await caller.campaign.list({ page: 2, pageSize: 5 });
      expect(result.campaigns.length).toBe(5);
      expect(result.totalCount).toBe(15);
      expect(result.campaigns[0]?.name).toBe("Paginated Campaign 6");
      expect(result.campaigns[4]?.name).toBe("Paginated Campaign 10");

      // Page 3, Size 5
      result = await caller.campaign.list({ page: 3, pageSize: 5 });
      expect(result.campaigns.length).toBe(5);
      expect(result.totalCount).toBe(15);
      expect(result.campaigns[0]?.name).toBe("Paginated Campaign 11");
      expect(result.campaigns[4]?.name).toBe("Paginated Campaign 15"); // Oldest

      // Page 4, Size 5 (should be empty)
      result = await caller.campaign.list({ page: 4, pageSize: 5 });
      expect(result.campaigns.length).toBe(0);
      expect(result.totalCount).toBe(15);

      // Test default page size (10)
      result = await caller.campaign.list({ page: 1 }); // Default size is 10
      expect(result.campaigns.length).toBe(10);
      expect(result.totalCount).toBe(15);
      expect(result.campaigns[0]?.name).toBe("Paginated Campaign 1");
      expect(result.campaigns[9]?.name).toBe("Paginated Campaign 10");

      result = await caller.campaign.list({ page: 2 }); // Default size is 10
      expect(result.campaigns.length).toBe(5); // Remaining 5
      expect(result.totalCount).toBe(15);
      expect(result.campaigns[0]?.name).toBe("Paginated Campaign 11");
      expect(result.campaigns[4]?.name).toBe("Paginated Campaign 15");
    });
  });


  // --- campaign.resume Tests ---

  describe("campaign.resume", () => {
    let pausedCampaign: Campaign;
    let scheduledCampaign: Campaign;
    let runningCampaign: Campaign;
    let completedCampaign: Campaign;
    let failedCampaign: Campaign;
    let otherUserPausedCampaign: Campaign;

    beforeEach(async () => {
      // Create campaigns with various statuses for testing
      [
        pausedCampaign,
        scheduledCampaign,
        runningCampaign,
        completedCampaign,
        failedCampaign,
        otherUserPausedCampaign
      ] = await Promise.all([
        // Paused campaign for the test user (target for success case)
        db.campaign.create({
          data: {
            userId: testUserId, name: "Paused Campaign", contactListId: testUserContactList.id,
            messageTemplateId: testUserTemplate.id, defaultNameValue: "Paused", scheduledAt: new Date(),
            status: 'Paused', totalContacts: 10, sentCount: 2, failedCount: 0, lastProcessedContactIndex: 1,
          }
        }),
        // Other statuses for the test user (target for failure cases)
        db.campaign.create({
          data: {
            userId: testUserId, name: "Scheduled Campaign", contactListId: testUserContactList.id,
            messageTemplateId: testUserTemplate.id, defaultNameValue: "Scheduled", scheduledAt: new Date(),
            status: 'Scheduled', totalContacts: 5, sentCount: 0, failedCount: 0,
          }
        }),
         db.campaign.create({
          data: {
            userId: testUserId, name: "Running Campaign", contactListId: testUserContactList.id,
            messageTemplateId: testUserTemplate.id, defaultNameValue: "Running", scheduledAt: new Date(),
            status: 'Running', totalContacts: 8, sentCount: 1, failedCount: 0, lastProcessedContactIndex: 0, startedAt: new Date(),
          }
        }),
         db.campaign.create({
          data: {
            userId: testUserId, name: "Completed Campaign", contactListId: testUserContactList.id,
            messageTemplateId: testUserTemplate.id, defaultNameValue: "Completed", scheduledAt: new Date(),
            status: 'Completed', totalContacts: 3, sentCount: 3, failedCount: 0, completedAt: new Date(),
          }
        }),
         db.campaign.create({
          data: {
            userId: testUserId, name: "Failed Campaign", contactListId: testUserContactList.id,
            messageTemplateId: testUserTemplate.id, defaultNameValue: "Failed", scheduledAt: new Date(),
            status: 'Failed', totalContacts: 4, sentCount: 0, failedCount: 1, completedAt: new Date(),
          }
        }),
        // Paused campaign for the other user (target for ownership test)
        db.campaign.create({
          data: {
            userId: otherUserId, name: "Other User Paused", contactListId: otherUserContactList.id,
            messageTemplateId: otherUserTemplate.id, defaultNameValue: "OtherPaused", scheduledAt: new Date(),
            status: 'Paused', totalContacts: 2, sentCount: 0, failedCount: 0,
          }
        }),
      ]);
    });

    it("should successfully resume a paused campaign", async () => {
      const result = await caller.campaign.resume({ campaignId: pausedCampaign.id });

      expect(result).toEqual({ success: true, message: "Campaign resume initiated." });

      // Verify status update in DB
      const updatedCampaign = await db.campaign.findUnique({ where: { id: pausedCampaign.id } });
      expect(updatedCampaign?.status).toBe('Scheduled');

      // Verify CampaignRunnerService was called
      expect(CampaignRunnerService).toHaveBeenCalledTimes(1);
      expect(mockRunCampaign).toHaveBeenCalledTimes(1);
      expect(mockRunCampaign).toHaveBeenCalledWith(pausedCampaign.id);
    });

    it("should throw NOT_FOUND if campaign does not exist", async () => {
      const nonExistentId = generateNonExistentCuid();
      await expect(caller.campaign.resume({ campaignId: nonExistentId })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
          message: expect.stringContaining('Campaign not found or access denied.'),
        })
      );
       expect(mockRunCampaign).not.toHaveBeenCalled();
    });

    it("should throw NOT_FOUND if campaign belongs to another user", async () => {
      await expect(caller.campaign.resume({ campaignId: otherUserPausedCampaign.id })).rejects.toThrow(
        expect.objectContaining({
          code: 'NOT_FOUND',
          message: expect.stringContaining('Campaign not found or access denied.'),
        })
      );
       expect(mockRunCampaign).not.toHaveBeenCalled();
    });

    it.each([
      { status: 'Scheduled', campaign: () => scheduledCampaign },
      { status: 'Running', campaign: () => runningCampaign },
      { status: 'Completed', campaign: () => completedCampaign },
      { status: 'Failed', campaign: () => failedCampaign },
    ])("should throw BAD_REQUEST if campaign status is $status", async ({ status, campaign }) => {
      const targetCampaign = campaign(); // Get the campaign object for this iteration
      await expect(caller.campaign.resume({ campaignId: targetCampaign.id })).rejects.toThrow(
        expect.objectContaining({
          code: 'BAD_REQUEST',
          message: `Campaign cannot be resumed from status '${status}'. It must be 'Paused'.`,
        })
      );
       expect(mockRunCampaign).not.toHaveBeenCalled();

       // Verify status did not change
       const dbCampaign = await db.campaign.findUnique({ where: { id: targetCampaign.id } });
       expect(dbCampaign?.status).toBe(status);
    });
  });

  // TODO: Add tests for delete procedure
  // TODO: Add tests for get procedure if implemented
  // TODO: Add tests for update procedure if implemented
});