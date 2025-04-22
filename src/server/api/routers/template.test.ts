// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { type AppRouter, appRouter } from "~/server/api/root";
import { createCallerFactory } from "~/server/api/trpc";
import { type Session } from "next-auth";
import { db } from "~/server/db";
import { type MessageTemplate } from "@prisma/client";

// Mock session data - replace with realistic test user data setup if needed
const mockSession: Session = {
  user: { id: "test-user-id", name: "Test User", email: "test@example.com" },
  expires: "1", // Using a simple string, adjust if date object is needed
};

// Create a caller instance with mocked context
const createCaller = createCallerFactory(appRouter);
const caller = createCaller({
  session: mockSession,
  db: db, // Use the actual db instance for integration tests
  headers: new Headers(),
});

// Helper function to clean up templates for the test user
const cleanupTestUserTemplates = async () => {
  await db.messageTemplate.deleteMany({
    where: { userId: mockSession.user.id },
  });
};

describe("Template Router", () => {
  // Setup/Teardown for the entire suite
  beforeAll(async () => {
    // Ensure the test user exists
    await db.user.upsert({
      where: { id: mockSession.user.id },
      update: {}, // No update needed if exists
      create: {
        id: mockSession.user.id,
        email: mockSession.user.email!, // Assuming email is non-null for creation
        name: mockSession.user.name,
        // Add other required fields for user creation if necessary
      },
    });
    // Clean up any leftover templates from previous runs
    await cleanupTestUserTemplates();
  });

  afterAll(async () => {
    // Clean up templates first due to foreign key constraint
    await cleanupTestUserTemplates();
    // Delete the test user
    await db.user.delete({ where: { id: mockSession.user.id } }).catch(() => {
      // Ignore errors if user doesn't exist (e.g., if setup failed)
    });
  });

  // Clean up before each test to ensure isolation
  beforeEach(async () => {
    await cleanupTestUserTemplates();
  });

  it("should create a new template", async () => {
    const input = { name: "Test Template 1", textContent: "Hello {Name}!" };
    const result = await caller.template.create(input);

    expect(result).toBeDefined();
    expect(result.name).toBe(input.name);
    expect(result.textContent).toBe(input.textContent);
    expect(result.userId).toBe(mockSession.user.id);

    // Verify it's in the DB
    const dbTemplate = await db.messageTemplate.findUnique({ where: { id: result.id } });
    expect(dbTemplate).not.toBeNull();
    expect(dbTemplate?.name).toBe(input.name);
  });

  it("should list templates for the user", async () => {
     // Create some templates first
    await caller.template.create({ name: "List Test 1", textContent: "Content 1" });
    await caller.template.create({ name: "List Test 2", textContent: "Content 2" });

    const result = await caller.template.list();

    expect(result).toBeDefined();
    expect(result.length).toBe(2);
    expect(result[0]?.name).toMatch(/List Test \d/); // Check names (order might vary)
    expect(result[1]?.name).toMatch(/List Test \d/);
    expect(result.every(t => t.userId === mockSession.user.id)).toBe(true); // Ensure all belong to user
  });

  it("should get a specific template by ID", async () => {
    const created = await caller.template.create({ name: "Get Test", textContent: "Get Content" });
    const result = await caller.template.get({ id: created.id });

    expect(result).toBeDefined();
    expect(result.id).toBe(created.id);
    expect(result.name).toBe("Get Test");
    expect(result.userId).toBe(mockSession.user.id);
  });

   it("should fail to get a template belonging to another user", async () => {
     const otherUserId = "other-user-id-get"; // Use unique ID per test
     let otherUserTemplate: MessageTemplate | null = null;
     try {
       // 1. Create the other user
       await db.user.create({ data: { id: otherUserId, email: `${otherUserId}@test.com` } });

       // 2. Create the template belonging to the other user
       otherUserTemplate = await db.messageTemplate.create({
         data: {
           userId: otherUserId,
           name: "Other User Template",
           textContent: "Secret content",
         },
       });

       // 3. Assert: Expect the caller (using test-user-id) to NOT find it
       await expect(
         caller.template.get({ id: otherUserTemplate.id })
       ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' })); // Check the error code

     } finally {
       // 4. Cleanup
       if (otherUserTemplate) {
         await db.messageTemplate.delete({ where: { id: otherUserTemplate.id } }).catch(() => {});
       }
       await db.user.delete({ where: { id: otherUserId } }).catch(() => {});
     }
   });


  it("should update a template", async () => {
    const created = await caller.template.create({ name: "Update Test", textContent: "Initial Content" });
    const updateInput = {
      id: created.id,
      name: "Updated Name",
      textContent: "Updated Content",
    };
    const result = await caller.template.update(updateInput);

    expect(result).toBeDefined();
    expect(result.id).toBe(created.id);
    expect(result.name).toBe(updateInput.name);
    expect(result.textContent).toBe(updateInput.textContent);
    expect(result.userId).toBe(mockSession.user.id);

    // Verify update in DB
    const dbTemplate = await db.messageTemplate.findUnique({ where: { id: created.id } });
    expect(dbTemplate?.name).toBe(updateInput.name);
  });

  it("should fail to update a template belonging to another user", async () => {
    const otherUserId = "other-user-id-update"; // Use unique ID per test
    let otherUserTemplate: MessageTemplate | null = null;
    try {
      // 1. Create the other user
      await db.user.create({ data: { id: otherUserId, email: `${otherUserId}@test.com` } });

      // 2. Create the template belonging to the other user
      otherUserTemplate = await db.messageTemplate.create({
        data: { userId: otherUserId, name: "Other Update", textContent: "..." }
      });

      // 3. Assert: Expect the caller (using test-user-id) to fail updating it
      await expect(
        caller.template.update({ id: otherUserTemplate.id, name: "Attempted Update", textContent: "..." })
      ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' })); // Check the error code

    } finally {
       // 4. Cleanup
      if (otherUserTemplate) {
        await db.messageTemplate.delete({ where: { id: otherUserTemplate.id } }).catch(() => {});
      }
      await db.user.delete({ where: { id: otherUserId } }).catch(() => {});
    }
  });

  it("should delete a template", async () => {
    const created = await caller.template.create({ name: "Delete Test", textContent: "Delete Me" });
    const result = await caller.template.delete({ id: created.id });

    expect(result).toBeDefined();
    expect(result.success).toBe(true);

    // Verify deletion from DB
    const dbTemplate = await db.messageTemplate.findUnique({ where: { id: created.id } });
    expect(dbTemplate).toBeNull();
  });

   it("should fail to delete a template belonging to another user", async () => {
     const otherUserId = "other-user-id-delete"; // Use unique ID per test
     let otherUserTemplate: MessageTemplate | null = null;
     try {
       // 1. Create the other user
       await db.user.create({ data: { id: otherUserId, email: `${otherUserId}@test.com` } });

       // 2. Create the template belonging to the other user
       otherUserTemplate = await db.messageTemplate.create({
         data: { userId: otherUserId, name: "Other Delete", textContent: "..." }
       });

       // 3. Assert: Expect the caller (using test-user-id) to fail deleting it
       await expect(
         caller.template.delete({ id: otherUserTemplate.id })
       ).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' })); // Check the error code

       // 4. Assert: Check it wasn't deleted from DB
       const dbTemplate = await db.messageTemplate.findUnique({ where: { id: otherUserTemplate.id } });
       expect(dbTemplate).not.toBeNull();

     } finally {
        // 5. Cleanup
       if (otherUserTemplate) {
         // Attempt to delete template again in case assertion failed before cleanup
         await db.messageTemplate.delete({ where: { id: otherUserTemplate.id } }).catch(() => {});
       }
       await db.user.delete({ where: { id: otherUserId } }).catch(() => {});
     }
   });

   // TODO: Add tests for input validation errors (e.g., empty name/content)

});