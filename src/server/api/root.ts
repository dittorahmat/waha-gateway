import { postRouter } from "~/server/api/routers/post";
import { authRouter } from "~/server/api/routers/auth"; // Added import
import { templateRouter } from "~/server/api/routers/template"; // Added template import
import { contactListRouter } from "~/server/api/routers/contactList"; // Added contact list import
import { wahaRouter } from "~/server/api/routers/waha"; // Added WAHA router import
import { campaignRouter } from "~/server/api/routers/campaign"; // Added Campaign router import
import { mediaLibraryRouter } from "~/server/api/routers/mediaLibrary"; // Added Media Library router import
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  post: postRouter,
  auth: authRouter, // Added auth router
  template: templateRouter, // Added template router
  contactList: contactListRouter, // Added contact list router
  waha: wahaRouter, // Added WAHA router
  campaign: campaignRouter, // Added Campaign router
  mediaLibrary: mediaLibraryRouter, // Added Media Library router
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
