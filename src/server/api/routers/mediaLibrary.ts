import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { db } from '../../db';

export const mediaLibraryRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const items = await db.mediaLibraryItem.findMany({
      where: { userId },
      select: {
        id: true,
        filename: true,
        createdAt: true,
        mimeType: true, // Include mimeType for potential UI display
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    return items;
  }),

  upload: protectedProcedure
    .input(
      z.object({
        filename: z.string().min(1, "Filename cannot be empty"),
        // We expect the file content as a base64 string from the frontend
        fileContentBase64: z.string().min(1, "File content cannot be empty"),
        mimeType: z.string().min(1, "MIME type is required"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { filename, fileContentBase64, mimeType } = input;

      // Placeholder logic: In a real implementation, this would involve:
      // 1. Decoding the base64 string.
      // 2. Uploading the file content to a storage service (e.g., S3, GCS, local disk).
      // 3. Getting the storage path/URL.
      // 4. Saving the metadata to the database.

      console.log(`Placeholder: Uploading file "${filename}" (${mimeType}) for user ${userId}`);
      console.log(`Base64 length: ${fileContentBase64.length}`); // Log length to verify data transfer

      // Simulate database insertion and return a dummy ID
      // In a real scenario, replace this with actual DB insertion after upload
      const dummyId = `dummy-media-${Date.now()}`;
      const dummyStoragePath = `/uploads/user/${userId}/${dummyId}-${filename}`;

      // Simulate creating a record (replace with actual db.mediaLibraryItem.create)
      const newItem = {
        id: dummyId,
        userId: userId,
        filename: filename,
        storagePath: dummyStoragePath,
        mimeType: mimeType,
        createdAt: new Date(),
      };

      // For now, just return the simulated ID
      // In a real implementation, you would return the actual created item's ID
      // await db.mediaLibraryItem.create({ data: newItem }); // Uncomment when ready for DB interaction

      console.log("Placeholder upload successful, returning dummy data:", newItem);

      // Return only the ID as per the plan's requirement for the frontend
      return { id: newItem.id };

      // Alternatively, throw a NOT_IMPLEMENTED error if preferred for placeholder:
      // throw new TRPCError({
      //   code: "NOT_IMPLEMENTED",
      //   message: "Media upload functionality is not yet implemented.",
      // });
    }),
});