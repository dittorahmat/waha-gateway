import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
console.log('[ROUTER LOG] require.resolve ../../db.ts:', require.resolve('../../db.ts'));
import { db } from '../../db.ts';
console.log('[ROUTER LOG] db instance at router load:', db, 'typeof:', typeof db, 'constructor:', db?.constructor?.name, 'keys:', Object.keys(db));
import {
  WahaApiClient,
  type WAHASessionStatus,
} from "~/server/services/wahaClient";

// Instantiate the WAHA client
// Consider making this a singleton or using dependency injection if needed elsewhere
const wahaClient = new WahaApiClient();
const WAHA_DEFAULT_SESSION_NAME = "default"; // Use the required default session name

export const wahaRouter = createTRPCRouter({
  /**
   * Gets the current state of the user's WAHA session.
   * Fetches from DB, checks WAHA API, updates DB status if needed.
   */
  getSessionState: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // Check if the current user is associated with the 'default' session in DB (use ctx.db for testability)
    const wahaSession = await ctx.db.wahaSession.findFirst({
      where: { userId: userId, sessionName: WAHA_DEFAULT_SESSION_NAME },
    });

    if (!wahaSession) {
      // This user doesn't own the session (or no session exists)
      return { connected: false as const };
    }

    // User owns the session, get its status from WAHA API using 'default' name
    try {
      const sessionState = await wahaClient.getSessionStatus(
        WAHA_DEFAULT_SESSION_NAME,
      );

      // Update DB status if it differs from the API status
      if (wahaSession.status !== sessionState.status) {
        await ctx.db.wahaSession.update({
          where: { id: wahaSession.id }, // Update the specific record
          data: { status: sessionState.status },
        });
      }

      return {
        connected: true as const,
        status: sessionState.status as WAHASessionStatus,
        qrCode: sessionState.qr,
        pairingCode: sessionState.code,
      };
    } catch (error) {
      console.error(
        `Failed to get WAHA session state for user ${userId}, session ${WAHA_DEFAULT_SESSION_NAME}:`,
        error,
      );
      // Return the last known status from DB but indicate potential issue
      return {
        connected: true as const, // Still technically have a session record associated with user
        status: wahaSession.status as WAHASessionStatus, // Last known status
        error: "Failed to fetch latest status from WAHA.",
      };
    }
  }),

  /**
   * Starts a new WAHA session for the user.
   * Generates a session name, calls WAHA API, creates DB record.
   */
  startSession: protectedProcedure.mutation(async ({ ctx }) => {
    console.log('[DEBUG startSession] imported db === ctx.db?', db === ctx.db, 'db keys:', Object.keys(db), 'ctx.db keys:', Object.keys(ctx.db));
    const userId = ctx.session.user.id;
    // Check if *any* 'default' session exists in the DB
    const existingSession = await ctx.db.wahaSession.findFirst({
      where: { sessionName: WAHA_DEFAULT_SESSION_NAME },
    });
    console.log('[DEBUG startSession] existingSession:', existingSession);
    console.log('[DEBUG startSession] existingSession.userId:', existingSession?.userId, 'ctx.session.user.id:', userId);
    if (existingSession) {
      console.log('[DEBUG startSession] existingSession truthy, sameOwner:', existingSession.userId === userId);
      // A session exists. Check if it belongs to the current user.
      if (existingSession.userId === userId) {
        console.log('[DEBUG startSession] restart existing session flow');
        // Current user already owns the session, just try starting it again
        console.log(
          `User ${userId} already associated with session ${WAHA_DEFAULT_SESSION_NAME}. Attempting restart.`,
        );
        try {
          // Attempt to start (handles 'already started' gracefully)
          await wahaClient.startSession(WAHA_DEFAULT_SESSION_NAME);

          // Now, fetch the actual current status from the API
          const currentState = await wahaClient.getSessionStatus(
            WAHA_DEFAULT_SESSION_NAME,
          );

          // Update DB with the actual status
          await ctx.db.wahaSession.update({
            where: { id: existingSession.id },
            data: { status: currentState.status }, // Use actual status
          });

          // Return success, potentially including the actual status/QR/code
          return {
            success: true,
            message: `Session status refreshed: ${currentState.status}`,
            status: currentState.status,
            qrCode: currentState.qr,
            pairingCode: currentState.code,
          };
        } catch (error) {
          // Log the error if fetching status or updating DB fails after successful startSession call
          console.error(
            `Error refreshing status for existing WAHA session ${WAHA_DEFAULT_SESSION_NAME} after start attempt for user ${userId}:`,
            error,
          );
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to restart existing session.",
          });
        }
      } else {
        console.log('[DEBUG startSession] conflict: another user owns session:', existingSession.userId);
        // Another user owns the session
        console.warn(
          `User ${userId} attempted to start session, but user ${existingSession.userId} already owns the '${WAHA_DEFAULT_SESSION_NAME}' session.`,
        );
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Another user is already connected. Only one session is supported at a time.",
        });
      }
    } else {
      console.log('[DEBUG startSession] new session flow, creating for user:', userId);
      console.log('[DEBUG startSession] calling ctx.db.$transaction');
      let waApiCalled = false;
      // No 'default' session exists, create one for the current user
      console.log(
        `No existing '${WAHA_DEFAULT_SESSION_NAME}' session found. Creating for user ${userId}.`,
      );
      try {
        // Call WAHA API to start the 'default' session (outside transaction)
        await wahaClient.startSession(WAHA_DEFAULT_SESSION_NAME); // <-- RE-ENABLED
        waApiCalled = true;
        // --- BEGIN FIX: Use a transaction for user check and session creation ---
        await ctx.db.$transaction(async (tx) => {
          // Fetch the user *within the transaction*
          const foundUserInTx = await tx.user.findUnique({
            where: { id: userId },
            // No 'select' needed, fetch the full object (or at least the id)
          });
          console.log('[ROUTER LOG] Result of tx.user.findUnique:', foundUserInTx);

          if (!foundUserInTx) {
            console.error(`User fetch failed *inside transaction*: User with ID '${userId}' not found.`);
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `User fetch failed within transaction: User with ID '${userId}' not found. Cannot create session record.`,
            });
          }

          // User exists, proceed with creation *within the transaction*, using the fetched ID
          await tx.wahaSession.create({
            data: {
              userId: foundUserInTx.id, // Use the ID confirmed within the transaction
              sessionName: WAHA_DEFAULT_SESSION_NAME,
              status: "STARTING",
            },
          });
        });
        // --- END FIX ---
        return { success: true, message: "Session creation initiated." };
      } catch (error) {
        console.error(
          `Failed to start new WAHA session ${WAHA_DEFAULT_SESSION_NAME} for user ${userId}:`,
          error,
        );
        console.log('[DEBUG startSession] new-session catch error:', error, 'message:', error instanceof Error ? error.message : null, 'isTRPCError:', error instanceof TRPCError);
        if (waApiCalled) {
          console.log('[DEBUG startSession] transaction failure, propagating original error');
          throw error;
        }
        // Check if it's the specific 422 error we already know about
        if (error instanceof Error && error.message.includes("Status: 422")) {
           throw new TRPCError({
             code: "UNPROCESSABLE_CONTENT", // Or another appropriate code
             message: "WAHA configuration error: Only 'default' session supported.",
             cause: error,
           });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to start WAHA session.",
          cause: error, // Pass original error if needed
        });
      }
    }
  }),

  /**
   * Requests a pairing code from WAHA for the user's session.
   */
  requestPairingCode: protectedProcedure
    .input(z.object({ phoneNumber: z.string().min(5) })) // Basic phone number validation
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Check if the current user owns the 'default' session (use ctx.db for testability)
      const wahaSession = await ctx.db.wahaSession.findFirst({
        where: { userId: userId, sessionName: WAHA_DEFAULT_SESSION_NAME },
      });

      if (!wahaSession) {
        throw new TRPCError({
          code: "FORBIDDEN", // Or NOT_FOUND
          message: "You do not have an active WAHA session to request a code for.",
        });
      }

      // User owns the session, request code using 'default' name
      try {
        const code = await wahaClient.requestCode(
          WAHA_DEFAULT_SESSION_NAME,
          input.phoneNumber,
        );

        if (!code) {
          // requestCode returns null on failure based on wahaClient implementation
          throw new Error("WAHA API did not return a pairing code.");
        }

        return { success: true, code: code };
      } catch (error) {
         console.error(
           `Failed to request pairing code for session ${WAHA_DEFAULT_SESSION_NAME}, user ${userId}:`,
           error,
         );
         console.log('[DEBUG requestPairingCode] caught error:', error, 'message:', error instanceof Error ? error.message : null);
         throw new TRPCError({
           code: "INTERNAL_SERVER_ERROR",
           message: error instanceof Error ? error.message : "Failed to request pairing code.",
           cause: error,
         });
      }
    }),

  /**
   * Logs out the user's current WAHA session.
   */
  logoutSession: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // Find the session associated with this user (use ctx.db for testability)
    const wahaSession = await ctx.db.wahaSession.findFirst({
      where: { userId: userId, sessionName: WAHA_DEFAULT_SESSION_NAME },
    });

    if (!wahaSession) {
      // This user doesn't own the session, nothing to log out
      return { success: true, message: "No active session found for this user." };
    }

    // User owns the session, proceed with logout
    try {
      // Call WAHA API to log out the 'default' session
      await wahaClient.logoutSession(WAHA_DEFAULT_SESSION_NAME);

      // Delete the session record from DB to free up the slot (use ctx.db)
      await ctx.db.wahaSession.delete({
        where: { id: wahaSession.id },
      });

      console.log(`Session record deleted for user ${userId} after logout.`);
      return { success: true, message: "Session logged out successfully." };

    } catch (error) {
      console.error(
        `Failed to logout WAHA session ${WAHA_DEFAULT_SESSION_NAME} for user ${userId}:`,
        error,
      );
      console.log('[DEBUG logoutSession] caught error:', error, 'type:', typeof error);
      // Attempt to delete the DB record even if API logout failed,
      // as the session might be defunct anyway.
      try {
         await ctx.db.wahaSession.delete({
           where: { id: wahaSession.id },
         });
         console.warn(`Session record deleted for user ${userId} despite potential logout API error.`);
      } catch (dbError) {
         console.error(
           `Failed to delete session record for user ${userId} after logout error:`,
           dbError,
         );
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to logout WAHA session.",
        cause: error,
      });
    }
  }),

  /**
   * Sends a text message using the user's active WAHA session.
   */
  sendTextMessage: protectedProcedure
    .input(
      z.object({
        // Basic validation: number + @c.us or @g.us
        chatId: z.string().regex(/^(\d+@c\.us|\d+-\d+@g\.us)$/, {
          message: "Invalid Chat ID format (e.g., 1234567890@c.us or 123456-7890@g.us)",
        }),
        text: z.string().min(1, { message: "Message cannot be empty" }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      console.log('[DEBUG] sendTextMessage handler invoked. ctx.db === imported db?', ctx.db === db);
      console.log('[DEBUG] ctx.db keys:', Object.keys(ctx.db));
      console.log('[DEBUG] wahaClient instance constructor name:', wahaClient.constructor.name, 'instance:', wahaClient);
      const userId = ctx.session.user.id;

      // LOGGING: Compare imported db and ctx.db for diagnosing test/mock issues
      console.log('[HANDLER LOG] typeof imported db:', typeof db, 'typeof ctx.db:', typeof ctx.db);
      console.log('[HANDLER LOG] imported db === ctx.db?', db === ctx.db);
      console.log('[HANDLER LOG] imported db keys:', Object.keys(db));
      console.log('[HANDLER LOG] ctx.db keys:', ctx.db && Object.keys(ctx.db));
      // Print function references for findFirst for both imported db and ctx.db
      console.log('[HANDLER LOG] imported db.wahaSession.findFirst:', db.wahaSession.findFirst);
      console.log('[HANDLER LOG] ctx.db.wahaSession.findFirst:', ctx.db && ctx.db.wahaSession && ctx.db.wahaSession.findFirst);
      // Refactored: Use ctx.db for all DB operations so tests can inject mocks
      const wahaSession = await ctx.db.wahaSession.findFirst({
        where: { userId: userId, sessionName: WAHA_DEFAULT_SESSION_NAME },
      });
      console.log('[HANDLER LOG] ctx.db.wahaSession.findFirst returned:', wahaSession, 'ctx.db:', ctx.db);

      if (!wahaSession) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have an active WAHA session to send messages.",
        });
      }

      // Optional: Check if the session status is 'WORKING' before sending
      // const sessionStatus = await wahaClient.getSessionStatus(WAHA_DEFAULT_SESSION_NAME);
      // if (sessionStatus.status !== 'WORKING') {
      //   throw new TRPCError({
      //     code: 'PRECONDITION_FAILED',
      //     message: `Session is not in 'WORKING' state (current: ${sessionStatus.status}). Cannot send message.`,
      //   });
      // }

      try {
        const result = await wahaClient.sendTextMessage(
          WAHA_DEFAULT_SESSION_NAME,
          input.chatId,
          input.text,
        );

        console.log(
          `Text message sent successfully by user ${userId} to ${input.chatId}. API Response:`,
          result,
        );
        // Return success and potentially the message ID from WAHA response
        // Ensure result and result.id are checked for existence if needed
        return { success: true, messageId: result?.id, result };
      } catch (error) {
        console.error(
          `Failed to send text message via session ${WAHA_DEFAULT_SESSION_NAME} for user ${userId} to ${input.chatId}:`,
          error,
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to send message.",
          cause: error,
        });
      }
    }),
});