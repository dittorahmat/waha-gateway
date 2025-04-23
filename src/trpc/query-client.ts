import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from "@tanstack/react-query";
import SuperJSON from "superjson";
import { toast } from "sonner"; // Import toast for notifications
import { TRPCClientError } from "@trpc/client"; // Import TRPCClientError type

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 30 * 1000,
      },
      mutations: { // Add default options for mutations
        onError: (error) => {
          // Check if it's a tRPC error to potentially access structured error data
          if (error instanceof TRPCClientError) {
             // You could potentially customize the message based on error.shape?.code or other properties
             console.error("tRPC Mutation Error:", error);
             toast.error(`Error: ${error.message}`);
          } else if (error instanceof Error) {
             // Handle generic errors
             console.error("Mutation Error:", error);
             toast.error(`An error occurred: ${error.message}`);
          } else {
             // Handle unknown error types
             console.error("Unknown Mutation Error:", error);
             toast.error("An unknown error occurred.");
          }
        },
      },
      dehydrate: {
        serializeData: SuperJSON.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
      hydrate: {
        deserializeData: SuperJSON.deserialize,
      },
    },
  });
