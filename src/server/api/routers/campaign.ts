import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { schedulerService } from "~/server/db"; // Import the scheduler service singleton

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

      // 4. Schedule the job using the scheduler service
      //    No need to await this if we don't need to block the response on scheduling success
      schedulerService.scheduleCampaignJob(newCampaign);

      return newCampaign; // Return the created campaign object
    }),

  // runManually procedure removed as per plan

  // Procedure to delete a campaign
  delete: protectedProcedure
    .input(z.object({ campaignId: z.string().cuid({ message: "Invalid Campaign ID" }) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { campaignId } = input;

      // 1. Verify ownership first (important!)
      const campaign = await ctx.db.campaign.findUnique({
        where: { id: campaignId, userId: userId },
        select: { id: true, status: true }, // Select only needed fields
      });

      if (!campaign) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found or access denied.' });
      }

      // 2. Cancel any scheduled job *before* deleting the record
      //    It's safe to call even if the campaign wasn't 'Scheduled' or had no job.
      schedulerService.cancelCampaignJob(campaignId);
      console.log(`[CampaignRouter] Attempted to cancel job for campaign ${campaignId} before deletion.`);

      // 3. Delete the campaign from the database
      await ctx.db.campaign.delete({
        where: { id: campaignId },
      });

      console.log(`[CampaignRouter] Deleted campaign ${campaignId}.`);
      return { success: true, message: "Campaign deleted successfully." };
    }),


  // TODO: Add list, get, update procedures if needed later
  //       Ensure update procedure also calls schedulerService.cancelCampaignJob(campaignId)
  //       if the status changes from 'Scheduled' or scheduledAt is modified.
});