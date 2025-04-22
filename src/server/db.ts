import { PrismaClient } from "@prisma/client";

import { env } from "~/env";
import { WahaApiClient } from "./services/wahaClient"; // Import WAHA Client
import { SchedulerService } from "./services/scheduler"; // Import Scheduler Service

const createPrismaClient = () =>
  new PrismaClient({
    log:
      env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
  wahaApiClient: WahaApiClient | undefined; // Add placeholder for WAHA client
  schedulerService: SchedulerService | undefined; // Add placeholder for Scheduler service
};

// Instantiate Prisma Client (existing code)
export const db = globalForPrisma.prisma ?? createPrismaClient();
if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;

// Instantiate WAHA API Client
export const wahaApiClient = globalForPrisma.wahaApiClient ?? new WahaApiClient();
if (env.NODE_ENV !== "production") globalForPrisma.wahaApiClient = wahaApiClient;

// Instantiate Scheduler Service, passing dependencies
export const schedulerService = globalForPrisma.schedulerService ?? new SchedulerService(db, wahaApiClient);
if (env.NODE_ENV !== "production") globalForPrisma.schedulerService = schedulerService;

// Initialize the scheduler *after* it's instantiated
// Use an immediately-invoked async function expression (IIAFE)
// or simply call and let it run in the background if blocking isn't needed.
// Check if it's already initialized in development to avoid multiple runs during hot-reloads
if (env.NODE_ENV !== "production") {
    if (!(globalForPrisma as any).schedulerInitialized) {
        console.log("[Global] Initializing scheduler in development...");
        void schedulerService.initialize();
        (globalForPrisma as any).schedulerInitialized = true;
    }
} else {
    // In production, initialize directly
    console.log("[Global] Initializing scheduler in production...");
    void schedulerService.initialize();
}
