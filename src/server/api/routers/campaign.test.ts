import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { type AppRouter, appRouter } from "~/server/api/root";
import { createCallerFactory } from "~/server/api/trpc";
import { type Session } from "next-auth";
import { db } from "~/server/db";
import { type ContactList, type MessageTemplate, type MediaLibraryItem, type Campaign } from "@prisma/client";
import { TRPCError } from "@trpc/server";

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

   it("should use default 'Customer' for defaultNameValue if not provided", async () => {
     const input = {
       name: "Default Name Test",
       contactListId: testUserContactList.id,
       messageTemplateId: testUserTemplate.id,
       scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
       // defaultNameValue is omitted
     };
     const result = await caller.campaign.create(input);

     expect(result.defaultNameValue).toBe("Customer");

     // Verify in DB
     const dbCampaign = await db.campaign.findUnique({ where: { id: result.id } });
     expect(dbCampaign?.defaultNameValue).toBe("Customer");
   });

  it("should fail if required fields are missing (Zod validation)", async () => {
    const input = {
      // name is missing
      contactListId: testUserContactList.id,
      messageTemplateId: testUserTemplate.id,
      scheduledAt: new Date(),
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
    };
    await expect(caller.campaign.create(inputNonExistent)).rejects.toThrow(
      expect.objectContaining({ code: 'NOT_FOUND', message: expect.stringContaining("contact list not found") })
    );

    // Test with a list belonging to another user
    const inputOtherUser = {
      name: "Other User List Test",
      contactListId: otherUserContactList.id, // Belongs to other user
      messageTemplateId: testUserTemplate.id,
      scheduledAt: new Date(),
    };
    await expect(caller.campaign.create(inputOtherUser)).rejects.toThrow(
      expect.objectContaining({ code: 'NOT_FOUND', message: expect.stringContaining("contact list not found") })
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
    };
    await expect(caller.campaign.create(inputNonExistent)).rejects.toThrow(
      expect.objectContaining({ code: 'NOT_FOUND', message: expect.stringContaining("message template not found") })
    );

    // Test with a template belonging to another user
    const inputOtherUser = {
      name: "Other User Template Test",
      contactListId: testUserContactList.id,
      messageTemplateId: otherUserTemplate.id, // Belongs to other user
      scheduledAt: new Date(),
    };
    await expect(caller.campaign.create(inputOtherUser)).rejects.toThrow(
      expect.objectContaining({ code: 'NOT_FOUND', message: expect.stringContaining("message template not found") })
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
     };
     await expect(caller.campaign.create(inputNonExistent)).rejects.toThrow(
       expect.objectContaining({ code: 'NOT_FOUND', message: expect.stringContaining("media item not found") })
     );

     // Test with a media item belonging to another user
     const inputOtherUser = {
       name: "Other User Media Test",
       contactListId: testUserContactList.id,
       messageTemplateId: testUserTemplate.id,
       mediaLibraryItemId: otherUserMediaItem.id, // Belongs to other user
       scheduledAt: new Date(),
     };
     await expect(caller.campaign.create(inputOtherUser)).rejects.toThrow(
       expect.objectContaining({ code: 'NOT_FOUND', message: expect.stringContaining("media item not found") })
     );
   });

  // TODO: Add tests for other campaign procedures (list, get, update, delete) when implemented.
});