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

  runManually: protectedProcedure
    .input(z.object({ campaignId: z.string().cuid({ message: "Invalid Campaign ID" }) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // 1. Verify ownership and existence of the campaign
      const campaign = await ctx.db.campaign.findUnique({
          where: { id: input.campaignId, userId: userId }
      });
      if (!campaign) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found or access denied.' });
      }

      // 2. Check if campaign is already in a final or running state
      //    (Allow re-running 'Scheduled' or potentially 'Paused'/'Failed' in the future)
      if (['Running', 'Completed'].includes(campaign.status)) {
           throw new TRPCError({ code: 'BAD_REQUEST', message: `Campaign cannot be started manually, current status: ${campaign.status}.` });
      }
      // Optional: Add check for 'Failed' if re-running failed campaigns isn't desired yet.
      // if (campaign.status === 'Failed') {
      //      throw new TRPCError({ code: 'BAD_REQUEST', message: `Campaign has Failed. Cannot restart manually yet.` });
      // }


      // 3. Lazy import and run the service
      //    Lazy import helps avoid potential circular dependencies if services call each other
      const { CampaignRunnerService } = await import('~/server/services/campaignRunner');
      const runner = new CampaignRunnerService(ctx.db);

      // Await the runCampaign call. The API request will wait until the
      // simulation completes or fails. The service handles status updates internally.
      await runner.runCampaign(input.campaignId);

      // Note: Errors within runCampaign are caught there and update the status to Failed.
      // If runCampaign itself throws an unexpected error *before* its internal try/catch,
      // tRPC will handle it and return a 500 Internal Server Error.

      return { success: true, message: "Campaign run triggered. Check logs and campaign status for results." };
    }),

  // TODO: Add other campaign-related procedures (list, get, update, delete) if needed later
});