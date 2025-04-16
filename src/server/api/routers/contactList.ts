import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { parseContactsCSV } from "~/utils/csvParser";

export const contactListRouter = createTRPCRouter({
  upload: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "List name cannot be empty"),
        fileContentBase64: z.string().min(1, "File content cannot be empty"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { name, fileContentBase64 } = input;
      const userId = ctx.session.user.id;

      const { contacts, errors: parsingErrors } = parseContactsCSV(fileContentBase64);

      if (parsingErrors.length > 0) {
        // Consider how to best report these errors. Maybe join them?
        // For now, throwing the first error. Could also return a structured error.
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `CSV Parsing Error: ${parsingErrors.join("; ")}`,
        });
      }

      if (contacts.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No valid contacts found in the CSV file.",
        });
      }

      try {
        const newContactList = await db.$transaction(async (tx) => {
          // 1. Create the ContactList
          const list = await tx.contactList.create({
            data: {
              name,
              userId,
              contactCount: 0, // Initialize count, will update later
            },
          });

          // 2. Prepare Contact data
          const contactData = contacts.map((contact) => ({
            phoneNumber: contact.phoneNumber,
            firstName: contact.firstName,
            // userId: userId, // REMOVED: userId is not on the Contact model
            contactListId: list.id, // Associate contact with the list
          }));

          // 3. Create Contacts in bulk
          await tx.contact.createMany({
            data: contactData,
            skipDuplicates: true, // Optional: Decide if duplicate phone numbers within the list are allowed
          });

          // 4. Update the contact count on the list
          const updatedList = await tx.contactList.update({
            where: { id: list.id },
            data: {
              contactCount: contacts.length,
            },
          });

          return updatedList;
        });

        return newContactList;
      } catch (error) {
        console.error("Failed to create contact list and contacts:", error);
        // Check for specific Prisma errors if needed
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to save the contact list. Please try again.",
        });
      }
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const lists = await db.contactList.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        contactCount: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    return lists;
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { id } = input;

      // Verify the list belongs to the user before deleting
      const list = await db.contactList.findUnique({
        where: { id, userId },
      });

      if (!list) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact list not found or you do not have permission to delete it.",
        });
      }

      try {
        // Use a transaction to ensure both contacts and the list are deleted
        await db.$transaction(async (tx) => {
          // 1. Delete associated contacts first (important if cascade delete is not set/reliable)
          await tx.contact.deleteMany({
            where: { contactListId: id },
          });

          // 2. Delete the contact list
          await tx.contactList.delete({
            where: { id },
          });
        });

        return { success: true };
      } catch (error) {
        console.error("Failed to delete contact list:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete the contact list. Please try again.",
        });
      }
    }),
});