import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { db, schedulerService, wahaApiClient } from '../../db'; // Import db, scheduler, and waha client
import { CampaignRunnerService } from "~/server/services/campaignRunner"; // Import Campaign Runner Service

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

  // Procedure to resume a paused campaign
  resume: protectedProcedure
    .input(z.object({ campaignId: z.string().cuid({ message: "Invalid Campaign ID" }) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { campaignId } = input;

      // 1. Fetch campaign, verify ownership and status
      const campaign = await ctx.db.campaign.findUnique({
        where: { id: campaignId, userId: userId },
      });

      if (!campaign) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found or access denied.' });
      }

      if (campaign.status !== 'Paused') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Campaign cannot be resumed from status '${campaign.status}'. It must be 'Paused'.` });
      }

      // 2. Update status back to 'Scheduled' (runner service will immediately pick it up and change to 'Running')
      //    We set it to 'Scheduled' first to signify intent and allow the runner's logic to handle the 'Running' transition.
      await ctx.db.campaign.update({
        where: { id: campaignId },
        data: { status: 'Scheduled' },
      });
      console.log(`[CampaignRouter] Resuming campaign ${campaignId}. Status set to Scheduled.`);

      // 3. Instantiate runner service and trigger immediate run
      //    We use the singleton db and wahaApiClient instances.
      try {
        const campaignRunnerService = new CampaignRunnerService(db, wahaApiClient);
        // Run asynchronously - no need to wait for the entire campaign to finish here.
        void campaignRunnerService.runCampaign(campaignId);
        console.log(`[CampaignRouter] Triggered immediate run for campaign ${campaignId}.`);
      } catch (runError) {
          // Log the error but don't necessarily fail the mutation,
          // as the status update already happened. The runner itself handles failures.
          console.error(`[CampaignRouter] Error triggering immediate run for campaign ${campaignId}:`, runError);
          // Optionally, could try reverting status back to Paused here, but might be complex.
      }

      return { success: true, message: "Campaign resume initiated." };
    }),

  // Procedure to list campaigns for the current user
  list: protectedProcedure
    .input(
      z.object({
        page: z.number().int().positive().optional().default(1),
        pageSize: z.number().int().positive().optional().default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { page, pageSize } = input;

      const skip = (page - 1) * pageSize;
      const take = pageSize;

      // Fetch total count and paginated campaigns in parallel
      const [totalCount, campaigns] = await Promise.all([
        ctx.db.campaign.count({
          where: { userId: userId },
        }),
        ctx.db.campaign.findMany({
          where: { userId: userId },
          orderBy: { createdAt: 'desc' }, // Order by creation date, newest first
          skip: skip,
          take: take,
          // Select only necessary fields for the list view
          select: {
            id: true,
            name: true,
            status: true,
            scheduledAt: true,
            createdAt: true,
            totalContacts: true,
            sentCount: true,
            failedCount: true,
            // Optionally include related data if needed by the table, but keep it minimal
            // contactList: { select: { name: true } },
            // messageTemplate: { select: { name: true } }
          }
        })
      ]);

      return {
        campaigns,
        totalCount,
      };
    }),


  // TODO: Add get procedure if needed later
  // TODO: Ensure update procedure also calls schedulerService.cancelCampaignJob(campaignId)
  //       if the status changes from 'Scheduled' or scheduledAt is modified.
});