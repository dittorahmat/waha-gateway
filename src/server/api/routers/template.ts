import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc"; // Corrected import path
import { z } from "zod";
import { TRPCError } from "@trpc/server";

export const templateRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Name cannot be empty"),
        textContent: z.string().min(1, "Content cannot be empty"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const template = await ctx.db.messageTemplate.create({
        data: {
          userId,
          name: input.name,
          textContent: input.textContent,
        },
      });
      return template;
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const templates = await ctx.db.messageTemplate.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return templates;
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const template = await ctx.db.messageTemplate.findUnique({
        where: { id: input.id, userId },
      });
      if (!template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });
      }
      return template;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1, "Name cannot be empty"),
        textContent: z.string().min(1, "Content cannot be empty"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      // First, verify the template exists and belongs to the user
      const existingTemplate = await ctx.db.messageTemplate.findUnique({
        where: { id: input.id, userId },
      });
      if (!existingTemplate) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found or you do not have permission to update it.",
        });
      }
      // Proceed with the update
      const updatedTemplate = await ctx.db.messageTemplate.update({
        where: { id: input.id }, // No need for userId here as we already checked ownership
        data: {
          name: input.name,
          textContent: input.textContent,
        },
      });
      return updatedTemplate;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      // Verify ownership before deleting
      const existingTemplate = await ctx.db.messageTemplate.findUnique({
        where: { id: input.id, userId },
      });
      if (!existingTemplate) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found or you do not have permission to delete it.",
        });
      }
      // Proceed with deletion
      await ctx.db.messageTemplate.delete({
        where: { id: input.id },
      });
      return { success: true };
    }),
});