import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

// Zod schema for the create campaign input validation
const createCampaignInput = z.object({
  name: z.string().min(1, "Campaign name cannot be empty"),
  contactListId: z.string().cuid({ message: "Invalid Contact List ID" }),
  messageTemplateId: z.string().cuid({ message: "Invalid Message Template ID" }),
  mediaLibraryItemId: z.string().cuid({ message: "Invalid Media Item ID" }).optional(), // Optional image
  defaultNameValue: z.string().min(1, "Default name value cannot be empty"),
  // Ensure the date is required and is a valid date object
  scheduledAt: z.date({ required_error: "Scheduled date and time are required" }),
});

export const campaignRouter = createTRPCRouter({
  // Procedure to create a new campaign
  create: protectedProcedure
    .input(createCampaignInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // 1. Verify ownership and existence of related entities
      const contactList = await ctx.db.contactList.findUnique({
        where: { id: input.contactListId, userId },
      });
      if (!contactList) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Selected Contact List not found or access denied." });
      }

      const messageTemplate = await ctx.db.messageTemplate.findUnique({
        where: { id: input.messageTemplateId, userId },
      });
      if (!messageTemplate) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Selected Message Template not found or access denied." });
      }

      if (input.mediaLibraryItemId) {
        const mediaItem = await ctx.db.mediaLibraryItem.findUnique({
          where: { id: input.mediaLibraryItemId, userId },
        });
        if (!mediaItem) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Selected Media Item not found or access denied." });
        }
      }

      // 2. Fetch contactCount (already available from the verified contactList)
      const contactCount = contactList.contactCount;

      // 3. Create the Campaign record
      const newCampaign = await ctx.db.campaign.create({
        data: {
          userId,
          name: input.name,
          contactListId: input.contactListId,
          messageTemplateId: input.messageTemplateId,
          mediaLibraryItemId: input.mediaLibraryItemId, // Will be null if not provided
          defaultNameValue: input.defaultNameValue,
          scheduledAt: input.scheduledAt,
          status: "Scheduled", // Initial status
          totalContacts: contactCount,
          sentCount: 0,
          failedCount: 0,
        },
      });

      return newCampaign; // Return the created campaign object
    }),

  // TODO: Add other campaign-related procedures (list, get, update, delete) if needed later
});