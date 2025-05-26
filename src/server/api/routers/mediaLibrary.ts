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

      // 1. Decode the base64 string
      const fileContent = Buffer.from(fileContentBase64, 'base64');

      // 2. File Type Validation: Allow only specific image and video types
      const allowedMimeTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'video/mp4',
        'video/webm',
      ];
      if (!allowedMimeTypes.includes(mimeType)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Disallowed file type: ${mimeType}. Allowed types are: ${allowedMimeTypes.join(', ')}`,
        });
      }

      // 3. File Size Validation: Limit file size (e.g., 10MB)
      const maxFileSize = 10 * 1024 * 1024; // 10 MB
      if (fileContent.length > maxFileSize) {
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message: `File size exceeds the limit of ${maxFileSize / (1024 * 1024)}MB.`,
        });
      }

      // TODO: Implement malicious content scanning before storing the file.
      // This might involve integrating with an external scanning service or using a library.

      // TODO: Implement secure storage logic.
      // This would involve uploading the `fileContent` buffer to a storage service (e.g., S3, GCS, local disk)
      // and getting the storage path/URL. Ensure storage prevents directory traversal or execution of uploaded files.

      // Placeholder logic: In a real implementation, this would involve:
      // 1. Decoding the base64 string. (DONE above)
      // 2. Uploading the file content to a storage service (e.g., S3, GCS, local disk). (TODO)
      // 3. Getting the storage path/URL. (TODO)
      // 4. Saving the metadata to the database. (TODO - currently simulated)

      console.log(`Processing file "${filename}" (${mimeType}) for user ${userId}`);
      console.log(`File size: ${fileContent.length} bytes`);

      // Simulate database insertion and return a dummy ID
      // In a real scenario, replace this with actual DB insertion after upload

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