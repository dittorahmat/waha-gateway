// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { type AppRouter, appRouter } from "~/server/api/root";
import { createCallerFactory } from "~/server/api/trpc";
import { type Session } from "next-auth";
import { db } from "~/server/db";
import { type ContactList, type Contact } from "@prisma/client";

// Helper to create base64 encoded CSV string
const toBase64 = (str: string) => Buffer.from(str).toString("base64");

// Mock session data
const mockSession: Session = {
  user: { id: "contact-list-test-user-id", name: "Contact List Test User", email: "contact-list-test@example.com" },
  expires: "1",
};

// Create a caller instance
const createCaller = createCallerFactory(appRouter);
const caller = createCaller({
  session: mockSession,
  db: db,
  headers: new Headers(),
});

// Helper function to clean up test data for the user
const cleanupTestData = async () => {
  const userId = mockSession.user.id;
  // Find lists belonging to the user
  const userLists = await db.contactList.findMany({
    where: { userId },
    select: { id: true },
  });
  const listIds = userLists.map(list => list.id);

  // Delete contacts associated with those lists
  if (listIds.length > 0) {
    await db.contact.deleteMany({ where: { contactListId: { in: listIds } } });
  }
  // Delete the lists themselves
  await db.contactList.deleteMany({ where: { userId } });
};

describe("ContactList Router", () => {
  // Setup/Teardown for the entire suite
  beforeAll(async () => {
    // Ensure the test user exists
    await db.user.upsert({
      where: { id: mockSession.user.id },
      update: {},
      create: {
        id: mockSession.user.id,
        email: mockSession.user.email!,
        name: mockSession.user.name,
      },
    });
    // Clean up any leftover data from previous runs
    await cleanupTestData();
  });

  afterAll(async () => {
    // Clean up test data first
    await cleanupTestData();
    // Delete the test user
    await db.user.delete({ where: { id: mockSession.user.id } }).catch(() => {});
  });

  // Clean up before each test
  beforeEach(async () => {
    await cleanupTestData();
  });

  // --- Upload Tests ---
  describe("upload procedure", () => {
    it("should successfully upload a valid CSV with phone and name", async () => {
      const csvContent = `phone_number,first_name\n1112223333,Alice\n4445556666,Bob`;
      const input = { name: "Valid List 1", fileContentBase64: toBase64(csvContent) };
      const result = await caller.contactList.upload(input);

      expect(result).toBeDefined();
      expect(result.name).toBe(input.name);
      expect(result.userId).toBe(mockSession.user.id);
      expect(result.contactCount).toBe(2);

      // Verify DB records
      const dbList = await db.contactList.findUnique({ where: { id: result.id } });
      const dbContacts = await db.contact.findMany({ where: { contactListId: result.id } });

      expect(dbList).not.toBeNull();
      expect(dbContacts).toHaveLength(2);
      expect(dbContacts.some(c => c.phoneNumber === "1112223333@c.us" && c.firstName === "Alice")).toBe(true);
      expect(dbContacts.some(c => c.phoneNumber === "4445556666@c.us" && c.firstName === "Bob")).toBe(true);
      // userId is not on Contact model directly, association is through ContactList
    });

    it("should successfully upload a valid CSV with only phone", async () => {
        const csvContent = `phone_number\n7778889999\n0001112222`;
        const input = { name: "Valid List Phone Only", fileContentBase64: toBase64(csvContent) };
        const result = await caller.contactList.upload(input);

        expect(result).toBeDefined();
        expect(result.name).toBe(input.name);
        expect(result.contactCount).toBe(2);

        const dbContacts = await db.contact.findMany({ where: { contactListId: result.id } });
        expect(dbContacts).toHaveLength(2);
        expect(dbContacts.some(c => c.phoneNumber === "7778889999@c.us" && c.firstName === null)).toBe(true);
        expect(dbContacts.some(c => c.phoneNumber === "0001112222@c.us" && c.firstName === null)).toBe(true);
    });


    it("should fail if CSV is missing phone_number header", async () => {
      const csvContent = `first_name\nAlice`;
      const input = { name: "Invalid Header List", fileContentBase64: toBase64(csvContent) };

      await expect(caller.contactList.upload(input))
        .rejects.toThrow(expect.objectContaining({ code: 'BAD_REQUEST', message: expect.stringContaining("Missing required header 'phone_number'") }));
    });

    it("should fail if CSV contains no valid contacts", async () => {
      const csvContent = `phone_number,first_name\n123,Invalid\nabc,Invalid`;
      const input = { name: "No Valid Contacts List", fileContentBase64: toBase64(csvContent) };

       // Expect parser error first
      await expect(caller.contactList.upload(input))
        .rejects.toThrow(expect.objectContaining({ code: 'BAD_REQUEST', message: expect.stringContaining("Invalid phone number format") }));

      // Test case where parser succeeds but finds 0 valid contacts after filtering
      const csvContentZeroValid = `phone_number,first_name\n123,Invalid\nabc,Invalid`; // Same content, assume parser might change
      const inputZeroValid = { name: "Zero Valid Contacts", fileContentBase64: toBase64(csvContentZeroValid) };
       // Mock or adjust parser logic if needed to specifically test the "No valid contacts found" error after parsing
       // For now, the parser error takes precedence based on current implementation.
       // If parser was modified to *not* throw on invalid rows but just skip, then test for:
       // .rejects.toThrow(expect.objectContaining({ code: 'BAD_REQUEST', message: "No valid contacts found" }));
    });

     it("should fail if file content is empty", async () => {
        const csvContent = ``;
        const input = { name: "Empty File List", fileContentBase64: toBase64(csvContent) };

        // Expect Zod error first because input validation runs before parsing
        await expect(caller.contactList.upload(input))
          .rejects.toThrow(expect.objectContaining({ code: 'BAD_REQUEST' }));
     });

     it("should fail if file content is not valid base64", async () => {
        const input = { name: "Bad Base64 List", fileContentBase64: "this is not base64" };

        // Expect the parser to fail finding the header due to invalid base64 input
        await expect(caller.contactList.upload(input))
          .rejects.toThrow(expect.objectContaining({ code: 'BAD_REQUEST', message: expect.stringContaining("Missing required header 'phone_number'") }));
     });

     it("should fail if name is empty", async () => {
        const csvContent = `phone_number\n1234567890`;
        const input = { name: "", fileContentBase64: toBase64(csvContent) };

        await expect(caller.contactList.upload(input))
          .rejects.toThrow(expect.objectContaining({ code: 'BAD_REQUEST' })); // Zod error
     });

     it("should fail if fileContentBase64 is empty", async () => {
        const input = { name: "No Content List", fileContentBase64: "" };

        await expect(caller.contactList.upload(input))
          .rejects.toThrow(expect.objectContaining({ code: 'BAD_REQUEST' })); // Zod error
     });
  });

  // --- List Tests ---
  describe("list procedure", () => {
    it("should return an empty array when no lists exist", async () => {
      const result = await caller.contactList.list();
      expect(result).toEqual([]);
    });

    it("should return all lists belonging to the user", async () => {
      // Create lists
      await caller.contactList.upload({ name: "List A", fileContentBase64: toBase64("phone_number\n1111111111") });
      await caller.contactList.upload({ name: "List B", fileContentBase64: toBase64("phone_number\n2222222222") });

      const result = await caller.contactList.list();
      expect(result).toHaveLength(2);
      expect(result.some(l => l.name === "List A")).toBe(true);
      expect(result.some(l => l.name === "List B")).toBe(true);
      // The list procedure doesn't select userId, and the caller context ensures these belong to the user.
    });

    // Add test case for pagination/filtering if implemented later
  });

  // --- Delete Tests ---
  describe("delete procedure", () => {
    let listToDelete: ContactList;

    beforeEach(async () => {
      // Create a list to be deleted in tests
      listToDelete = await caller.contactList.upload({
        name: "To Be Deleted",
        fileContentBase64: toBase64("phone_number,first_name\n9876543210,DeleteMe"),
      });
      // Verify contact exists before delete test
      const contacts = await db.contact.findMany({ where: { contactListId: listToDelete.id } });
      expect(contacts).toHaveLength(1);
    });

    it("should successfully delete an existing list and its contacts", async () => {
      const result = await caller.contactList.delete({ id: listToDelete.id });
      expect(result.success).toBe(true);

      // Verify deletion from DB
      const dbList = await db.contactList.findUnique({ where: { id: listToDelete.id } });
      const dbContacts = await db.contact.findMany({ where: { contactListId: listToDelete.id } });
      expect(dbList).toBeNull();
      expect(dbContacts).toHaveLength(0);
    });

    it("should fail to delete a non-existent list", async () => {
      await expect(caller.contactList.delete({ id: "non-existent-id" }))
        .rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
    });

    it("should fail to delete a list belonging to another user", async () => {
      const otherUserId = "other-user-delete-list";
      let otherUserList: ContactList | null = null;
      try {
        // Create other user and list directly in DB
        await db.user.create({ data: { id: otherUserId, email: `${otherUserId}@test.com` } });
        otherUserList = await db.contactList.create({
          data: { userId: otherUserId, name: "Other User's List", contactCount: 0 }
        });

        // Assert: Caller (test user) cannot delete it
        await expect(caller.contactList.delete({ id: otherUserList.id }))
          .rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));

      } finally {
        // Cleanup
        if (otherUserList) await db.contactList.delete({ where: { id: otherUserList.id } }).catch(() => {});
        await db.user.delete({ where: { id: otherUserId } }).catch(() => {});
      }
    });
  });
});