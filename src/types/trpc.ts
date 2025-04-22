// Shared tRPC types for client and server. Do NOT import any server code here.
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
// Import the type only, not the implementation, to avoid pulling in server code.
import type { appRouter } from "../server/api/root";

export type AppRouter = typeof appRouter;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
