import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { type Session } from 'next-auth';

import { wahaRouter } from './waha';
import { type WahaApiClient, type WahaSessionState } from '~/server/services/wahaClient';
import { type PrismaClient, type WahaSession, type User } from '@prisma/client';
import type { DefaultArgs } from '@prisma/client/runtime/library';

// --- Mocks ---

// Mock Prisma Client - Use simple vi.fn()
const mockDb = {
  wahaSession: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(async (callback: (tx: any) => Promise<any>) => await callback(mockDb)), // Add type to callback param
};

// Mock WahaApiClient - Use simple vi.fn()
const mockWahaClient = {
  getSessionStatus: vi.fn(),
  startSession: vi.fn(),
  requestCode: vi.fn(),
  logoutSession: vi.fn(),
  sendTextMessage: vi.fn(),
};


// Mock the actual client constructor used in waha.ts
// or ensure the mocked instance is used (e.g., via dependency injection if refactored,
// or by mocking the module if needed - simpler approach for now assumes we can pass mocks)

// Helper to create a caller instance with context
const createCaller = (session: Session | null) => {
  const ctx = {
    session: session,
    db: mockDb,
    // Inject the mocked wahaClient if the router uses it via context (if refactored)
    // wahaClient: mockWahaClient, // Example if context injection is used
  };

  // If waha.ts directly instantiates WahaApiClient, we might need module mocking:
  // vi.mock('~/server/services/wahaClient', () => ({
  //   WahaApiClient: vi.fn(() => mockWahaClient),
  // }));
  // For now, assume direct instantiation and mock its methods globally if needed,
  // or ideally refactor waha.ts to accept client via context/DI.
  // Let's assume for now the global mock works via module mocking or similar setup in test/setup.ts

  // We need access to the *instance* used by the router.
  // If `new WahaApiClient()` is called inside waha.ts, we need to mock the class globally.
  // Let's add a mock for the class constructor for now.
  vi.mock('~/server/services/wahaClient', async (importOriginal) => {
    const original = await importOriginal<typeof import('~/server/services/wahaClient')>();
    return {
      ...original, // Keep other exports like types
      WahaApiClient: vi.fn(() => mockWahaClient), // Mock constructor to return our mock instance
    };
  });


  // Create the caller using the router definition and context
  // Adjust if your trpc setup differs
  return wahaRouter.createCaller(ctx as any); // Use 'as any' for simplicity or define a proper context type
};

// --- Test Suite ---

describe('wahaRouter', () => {
  const userId = 'test-user-id-123';
  const userSession: Session = {
    user: { id: userId, name: 'Test User', email: 'test@example.com' },
    expires: 'some-future-date',
  };
  const WAHA_DEFAULT_SESSION_NAME = 'default';

  // Reset mocks before each test
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // --- getSessionState Tests ---
  describe('getSessionState', () => {
    it('should return connected: false if no session exists for the user', async () => {
      const caller = createCaller(userSession);
      mockDb.wahaSession.findFirst.mockResolvedValue(null);

      const result = await caller.getSessionState();

      expect(result).toEqual({ connected: false });
      expect(mockDb.wahaSession.findFirst).toHaveBeenCalledWith({
        where: { userId: userId, sessionName: WAHA_DEFAULT_SESSION_NAME },
      });
      expect(mockWahaClient.getSessionStatus).not.toHaveBeenCalled();
    });

    it('should return status from API and update DB if user owns session', async () => {
      const caller = createCaller(userSession);
      const dbSession = { id: 'session-id-1', userId: userId, sessionName: WAHA_DEFAULT_SESSION_NAME, status: 'STARTING' };
      const apiStatus = { status: 'WORKING' as const, qr: null, code: null };

      mockDb.wahaSession.findFirst.mockResolvedValue(dbSession);
      mockWahaClient.getSessionStatus.mockResolvedValue(apiStatus);
      mockDb.wahaSession.update.mockResolvedValue({ ...dbSession, status: apiStatus.status }); // Mock update result

      const result = await caller.getSessionState();

      expect(result).toEqual({
        connected: true,
        status: 'WORKING',
        qrCode: null,
        pairingCode: null,
      });
      expect(mockDb.wahaSession.findFirst).toHaveBeenCalledOnce();
      expect(mockWahaClient.getSessionStatus).toHaveBeenCalledWith(WAHA_DEFAULT_SESSION_NAME);
      expect(mockDb.wahaSession.update).toHaveBeenCalledWith({
        where: { id: dbSession.id },
        data: { status: apiStatus.status },
      });
    });

     it('should return last known DB status and error if API call fails', async () => {
       const caller = createCaller(userSession);
       const dbSession = { id: 'session-id-2', userId: userId, sessionName: WAHA_DEFAULT_SESSION_NAME, status: 'WORKING' as const };
       const apiError = new Error("WAHA API timeout");

       mockDb.wahaSession.findFirst.mockResolvedValue(dbSession);
       mockWahaClient.getSessionStatus.mockRejectedValue(apiError);

       const result = await caller.getSessionState();

       expect(result).toEqual({
         connected: true,
         status: 'WORKING',
         error: "Failed to fetch latest status from WAHA.",
       });
       expect(mockDb.wahaSession.findFirst).toHaveBeenCalledOnce();
       expect(mockWahaClient.getSessionStatus).toHaveBeenCalledWith(WAHA_DEFAULT_SESSION_NAME);
       expect(mockDb.wahaSession.update).not.toHaveBeenCalled(); // Should not update on API error
     });

     it('should not update DB if API status matches DB status', async () => {
        const caller = createCaller(userSession);
        const dbSession = { id: 'session-id-3', userId: userId, sessionName: WAHA_DEFAULT_SESSION_NAME, status: 'SCAN_QR_CODE' as const };
        const apiStatus = { status: 'SCAN_QR_CODE' as const, qr: 'base64qrstring', code: null };

        mockDb.wahaSession.findFirst.mockResolvedValue(dbSession);
        mockWahaClient.getSessionStatus.mockResolvedValue(apiStatus);

        const result = await caller.getSessionState();

        expect(result).toEqual({
          connected: true,
          status: 'SCAN_QR_CODE',
          qrCode: 'base64qrstring',
          pairingCode: null,
        });
        expect(mockDb.wahaSession.findFirst).toHaveBeenCalledOnce();
        expect(mockWahaClient.getSessionStatus).toHaveBeenCalledWith(WAHA_DEFAULT_SESSION_NAME);
        expect(mockDb.wahaSession.update).not.toHaveBeenCalled(); // Status matches, no update needed
     });

     it('should throw UNAUTHORIZED if no session provided', async () => {
        const caller = createCaller(null); // No user session

        await expect(caller.getSessionState()).rejects.toThrow(
          new TRPCError({ code: 'UNAUTHORIZED' })
        );
        expect(mockDb.wahaSession.findFirst).not.toHaveBeenCalled();
     });
  });

  // --- startSession Tests ---
  describe('startSession', () => {
    it('should start session and create DB record if none exists', async () => {
      const caller = createCaller(userSession);
      mockDb.wahaSession.findFirst.mockResolvedValue(null); // No existing session
      mockWahaClient.startSession.mockResolvedValue(undefined); // API start succeeds
      // Mock the transaction: find user ok, create session ok
      mockDb.user.findUnique.mockResolvedValue({ id: userId, email: 'test@example.com', name: 'Test' }); // User found in tx
      mockDb.wahaSession.create.mockResolvedValue({ // Session created in tx
        id: 'new-session-id',
        userId: userId,
        sessionName: WAHA_DEFAULT_SESSION_NAME,
        status: 'STARTING',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
       // Mock the transaction execution itself
       mockDb.$transaction.mockImplementation(async (callback) => {
           // Simulate finding user and creating session within the callback
           await mockDb.user.findUnique({ where: { id: userId } });
           return await mockDb.wahaSession.create({
               data: { userId: userId, sessionName: WAHA_DEFAULT_SESSION_NAME, status: 'STARTING' }
           });
       });


      const result = await caller.startSession();

      expect(result).toEqual({ success: true, message: 'Session creation initiated.' });
      expect(mockDb.wahaSession.findFirst).toHaveBeenCalledWith({ where: { sessionName: WAHA_DEFAULT_SESSION_NAME } });
      expect(mockWahaClient.startSession).toHaveBeenCalledWith(WAHA_DEFAULT_SESSION_NAME);
      expect(mockDb.$transaction).toHaveBeenCalled();
      // Check calls inside transaction mock implementation if needed more specifically
      expect(mockDb.user.findUnique).toHaveBeenCalledWith({ where: { id: userId } });
      expect(mockDb.wahaSession.create).toHaveBeenCalledWith({
        data: { userId: userId, sessionName: WAHA_DEFAULT_SESSION_NAME, status: 'STARTING' },
      });
    });

    it('should throw error if WAHA API startSession fails', async () => {
      const caller = createCaller(userSession);
      const apiError = new Error("WAHA API unavailable");
      mockDb.wahaSession.findFirst.mockResolvedValue(null); // No existing session
      mockWahaClient.startSession.mockRejectedValue(apiError); // API start fails

      await expect(caller.startSession()).rejects.toThrow(
        new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to start WAHA session.',
          cause: apiError,
        })
      );
      expect(mockDb.wahaSession.findFirst).toHaveBeenCalledOnce();
      expect(mockWahaClient.startSession).toHaveBeenCalledOnce();
      expect(mockDb.$transaction).not.toHaveBeenCalled(); // Should fail before transaction
    });

     it('should throw error if DB creation fails within transaction', async () => {
       const caller = createCaller(userSession);
       const dbError = new Error("DB connection lost");
       mockDb.wahaSession.findFirst.mockResolvedValue(null); // No existing session
       mockWahaClient.startSession.mockResolvedValue(undefined); // API start succeeds
       // Mock transaction failure
       mockDb.$transaction.mockRejectedValue(dbError);

       // We expect the error from the transaction to propagate
       await expect(caller.startSession()).rejects.toThrow(dbError);

       expect(mockDb.wahaSession.findFirst).toHaveBeenCalledOnce();
       expect(mockWahaClient.startSession).toHaveBeenCalledOnce();
       expect(mockDb.$transaction).toHaveBeenCalledOnce();
       expect(mockDb.wahaSession.create).not.toHaveBeenCalled(); // Should fail within transaction mock
     });

    it('should restart existing session, get status, and update DB if user owns it', async () => {
      const caller = createCaller(userSession);
      const existingDbSession = { id: 'session-id-4', userId: userId, sessionName: WAHA_DEFAULT_SESSION_NAME, status: 'STOPPED' as const };
      const updatedApiStatus = { status: 'WORKING' as const, qr: null, code: null };

      mockDb.wahaSession.findFirst.mockResolvedValue(existingDbSession); // Found session owned by user
      mockWahaClient.startSession.mockResolvedValue(undefined); // API restart succeeds
      mockWahaClient.getSessionStatus.mockResolvedValue(updatedApiStatus); // API get status succeeds
      mockDb.wahaSession.update.mockResolvedValue({ ...existingDbSession, status: updatedApiStatus.status }); // DB update succeeds

      const result = await caller.startSession();

      expect(result).toEqual({
        success: true,
        message: `Session status refreshed: ${updatedApiStatus.status}`,
        status: updatedApiStatus.status,
        qrCode: updatedApiStatus.qr,
        pairingCode: updatedApiStatus.code,
      });
      expect(mockDb.wahaSession.findFirst).toHaveBeenCalledWith({ where: { sessionName: WAHA_DEFAULT_SESSION_NAME } });
      expect(mockWahaClient.startSession).toHaveBeenCalledWith(WAHA_DEFAULT_SESSION_NAME);
      expect(mockWahaClient.getSessionStatus).toHaveBeenCalledWith(WAHA_DEFAULT_SESSION_NAME);
      expect(mockDb.wahaSession.update).toHaveBeenCalledWith({
        where: { id: existingDbSession.id },
        data: { status: updatedApiStatus.status },
      });
      expect(mockDb.$transaction).not.toHaveBeenCalled(); // Should not create new via transaction
    });

     it('should throw CONFLICT if existing session is owned by another user', async () => {
       const caller = createCaller(userSession); // Current user
       const otherUserId = 'other-user-456';
       const existingDbSession = { id: 'session-id-5', userId: otherUserId, sessionName: WAHA_DEFAULT_SESSION_NAME, status: 'WORKING' as const };

       mockDb.wahaSession.findFirst.mockResolvedValue(existingDbSession); // Found session owned by other user

       await expect(caller.startSession()).rejects.toThrow(
         new TRPCError({
           code: 'CONFLICT',
           message: 'Another user is already connected. Only one session is supported at a time.',
         })
       );
       expect(mockDb.wahaSession.findFirst).toHaveBeenCalledOnce();
       expect(mockWahaClient.startSession).not.toHaveBeenCalled();
       expect(mockWahaClient.getSessionStatus).not.toHaveBeenCalled();
       expect(mockDb.wahaSession.update).not.toHaveBeenCalled();
       expect(mockDb.$transaction).not.toHaveBeenCalled();
     });

     it('should throw UNAUTHORIZED if no user session provided', async () => {
        const caller = createCaller(null); // No user session

        await expect(caller.startSession()).rejects.toThrow(
          new TRPCError({ code: 'UNAUTHORIZED' })
        );
        expect(mockDb.wahaSession.findFirst).not.toHaveBeenCalled();
     });

     // TODO: Add tests for failure cases when user owns existing session (API restart fail, getStatus fail, DB update fail)

  });

  // --- requestPairingCode Tests ---
  describe('requestPairingCode', () => {
    const validInput = { phoneNumber: '1234567890' };

    it('should request and return pairing code if user owns session', async () => {
      const caller = createCaller(userSession);
      const dbSession = { id: 'session-id-6', userId: userId, sessionName: WAHA_DEFAULT_SESSION_NAME, status: 'SCAN_QR_CODE' as const, createdAt: new Date(), updatedAt: new Date() };
      const pairingCode = '123-456';

      mockDb.wahaSession.findFirst.mockResolvedValue(dbSession); // User owns session
      mockWahaClient.requestCode.mockResolvedValue(pairingCode); // API returns code

      const result = await caller.requestPairingCode(validInput);

      expect(result).toEqual({ success: true, code: pairingCode });
      expect(mockDb.wahaSession.findFirst).toHaveBeenCalledWith({
        where: { userId: userId, sessionName: WAHA_DEFAULT_SESSION_NAME },
      });
      expect(mockWahaClient.requestCode).toHaveBeenCalledWith(WAHA_DEFAULT_SESSION_NAME, validInput.phoneNumber);
    });

    it('should throw error if WAHA API fails to return code (returns null)', async () => {
      const caller = createCaller(userSession);
      const dbSession = { id: 'session-id-7', userId: userId, sessionName: WAHA_DEFAULT_SESSION_NAME, status: 'SCAN_QR_CODE' as const, createdAt: new Date(), updatedAt: new Date() };
      const expectedErrorMessage = "WAHA API did not return a pairing code."; // Specific error message from router

      mockDb.wahaSession.findFirst.mockResolvedValue(dbSession); // User owns session
      mockWahaClient.requestCode.mockResolvedValue(null); // API fails (returns null)

      await expect(caller.requestPairingCode(validInput)).rejects.toThrow(
        new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: expectedErrorMessage, // Match the specific error message
        })
      );
      expect(mockDb.wahaSession.findFirst).toHaveBeenCalledOnce();
      expect(mockWahaClient.requestCode).toHaveBeenCalledOnce();
    });

     it('should throw error if WAHA API throws an error', async () => {
       const caller = createCaller(userSession);
       const dbSession = { id: 'session-id-8', userId: userId, sessionName: WAHA_DEFAULT_SESSION_NAME, status: 'SCAN_QR_CODE' as const, createdAt: new Date(), updatedAt: new Date() };
       const apiError = new Error("Network connection failed");

       mockDb.wahaSession.findFirst.mockResolvedValue(dbSession); // User owns session
       mockWahaClient.requestCode.mockRejectedValue(apiError); // API throws

       await expect(caller.requestPairingCode(validInput)).rejects.toThrow(
         new TRPCError({
           code: 'INTERNAL_SERVER_ERROR',
           message: apiError.message, // Router passes original message
           cause: apiError,
         })
       );
       expect(mockDb.wahaSession.findFirst).toHaveBeenCalledOnce();
       expect(mockWahaClient.requestCode).toHaveBeenCalledOnce();
     });

    it('should throw FORBIDDEN if user does not own the session', async () => {
      const caller = createCaller(userSession);
      mockDb.wahaSession.findFirst.mockResolvedValue(null); // No session found for user

      await expect(caller.requestPairingCode(validInput)).rejects.toThrow(
        new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have an active WAHA session to request a code for.',
        })
      );
      expect(mockDb.wahaSession.findFirst).toHaveBeenCalledOnce();
      expect(mockWahaClient.requestCode).not.toHaveBeenCalled();
    });

    it('should throw UNAUTHORIZED if no user session provided', async () => {
      const caller = createCaller(null); // No user session

      await expect(caller.requestPairingCode(validInput)).rejects.toThrow(
        new TRPCError({ code: 'UNAUTHORIZED' })
      );
      expect(mockDb.wahaSession.findFirst).not.toHaveBeenCalled();
    });

    // Note: Zod input validation errors are typically handled by tRPC middleware
    // before the resolver runs, so explicit tests for invalid input might be redundant
    // unless specific error handling based on input is done *within* the resolver.
  });

  // --- logoutSession Tests ---
  describe('logoutSession', () => {
    it('should logout session via API and delete DB record if user owns it', async () => {
      const caller = createCaller(userSession);
      const dbSession = { id: 'session-id-9', userId: userId, sessionName: WAHA_DEFAULT_SESSION_NAME, status: 'WORKING' as const, createdAt: new Date(), updatedAt: new Date() };

      mockDb.wahaSession.findFirst.mockResolvedValue(dbSession); // User owns session
      mockWahaClient.logoutSession.mockResolvedValue(undefined); // API logout succeeds
      mockDb.wahaSession.delete.mockResolvedValue(dbSession); // DB delete succeeds

      const result = await caller.logoutSession();

      expect(result).toEqual({ success: true, message: 'Session logged out successfully.' });
      expect(mockDb.wahaSession.findFirst).toHaveBeenCalledWith({
        where: { userId: userId, sessionName: WAHA_DEFAULT_SESSION_NAME },
      });
      expect(mockWahaClient.logoutSession).toHaveBeenCalledWith(WAHA_DEFAULT_SESSION_NAME);
      expect(mockDb.wahaSession.delete).toHaveBeenCalledWith({ where: { id: dbSession.id } });
    });

    it('should throw error but still delete DB record if API logout fails', async () => {
      const caller = createCaller(userSession);
      const dbSession = { id: 'session-id-10', userId: userId, sessionName: WAHA_DEFAULT_SESSION_NAME, status: 'WORKING' as const, createdAt: new Date(), updatedAt: new Date() };
      const apiError = new Error("WAHA API timeout during logout");

      mockDb.wahaSession.findFirst.mockResolvedValue(dbSession); // User owns session
      mockWahaClient.logoutSession.mockRejectedValue(apiError); // API logout fails
      mockDb.wahaSession.delete.mockResolvedValue(dbSession); // DB delete *still succeeds*

      await expect(caller.logoutSession()).rejects.toThrow(
        new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to logout WAHA session.',
          cause: apiError,
        })
      );
      expect(mockDb.wahaSession.findFirst).toHaveBeenCalledOnce();
      expect(mockWahaClient.logoutSession).toHaveBeenCalledOnce();
      // Important: Check that delete was still attempted and succeeded
      expect(mockDb.wahaSession.delete).toHaveBeenCalledWith({ where: { id: dbSession.id } });
    });

    it('should throw error if API logout succeeds but DB delete fails', async () => {
      const caller = createCaller(userSession);
      const dbSession = { id: 'session-id-11', userId: userId, sessionName: WAHA_DEFAULT_SESSION_NAME, status: 'WORKING' as const, createdAt: new Date(), updatedAt: new Date() };
      const dbError = new Error("DB constraint violation");

      mockDb.wahaSession.findFirst.mockResolvedValue(dbSession); // User owns session
      mockWahaClient.logoutSession.mockResolvedValue(undefined); // API logout succeeds
      mockDb.wahaSession.delete.mockRejectedValue(dbError); // DB delete fails

      // The router throws the original INTERNAL_SERVER_ERROR after catching the DB error
      await expect(caller.logoutSession()).rejects.toThrow(
         new TRPCError({
           code: 'INTERNAL_SERVER_ERROR',
           message: 'Failed to logout WAHA session.',
           // The original cause might be the API error if it happened first,
           // but in this case, the DB error is caught later. The router doesn't re-throw the DB error directly.
           // Let's check the message is correct.
         })
      );
      expect(mockDb.wahaSession.findFirst).toHaveBeenCalledOnce();
      expect(mockWahaClient.logoutSession).toHaveBeenCalledOnce();
      expect(mockDb.wahaSession.delete).toHaveBeenCalledOnce();
    });

     it('should throw error if both API logout and DB delete fail', async () => {
       const caller = createCaller(userSession);
       const dbSession = { id: 'session-id-12', userId: userId, sessionName: WAHA_DEFAULT_SESSION_NAME, status: 'WORKING' as const, createdAt: new Date(), updatedAt: new Date() };
       const apiError = new Error("WAHA API error");
       const dbError = new Error("DB error");

       mockDb.wahaSession.findFirst.mockResolvedValue(dbSession); // User owns session
       mockWahaClient.logoutSession.mockRejectedValue(apiError); // API logout fails
       mockDb.wahaSession.delete.mockRejectedValue(dbError); // DB delete also fails

       await expect(caller.logoutSession()).rejects.toThrow(
         new TRPCError({
           code: 'INTERNAL_SERVER_ERROR',
           message: 'Failed to logout WAHA session.',
           cause: apiError, // The first error (API error) is the cause passed
         })
       );
       expect(mockDb.wahaSession.findFirst).toHaveBeenCalledOnce();
       expect(mockWahaClient.logoutSession).toHaveBeenCalledOnce();
       expect(mockDb.wahaSession.delete).toHaveBeenCalledOnce(); // Delete was attempted
     });

    it('should return success without API/DB calls if user does not own session', async () => {
      const caller = createCaller(userSession);
      mockDb.wahaSession.findFirst.mockResolvedValue(null); // No session found for user

      const result = await caller.logoutSession();

      expect(result).toEqual({ success: true, message: 'No active session found for this user.' });
      expect(mockDb.wahaSession.findFirst).toHaveBeenCalledOnce();
      expect(mockWahaClient.logoutSession).not.toHaveBeenCalled();
      expect(mockDb.wahaSession.delete).not.toHaveBeenCalled();
    });

    it('should throw UNAUTHORIZED if no user session provided', async () => {
      const caller = createCaller(null); // No user session

      await expect(caller.logoutSession()).rejects.toThrow(
        new TRPCError({ code: 'UNAUTHORIZED' })
      );
      expect(mockDb.wahaSession.findFirst).not.toHaveBeenCalled();
    });
  });

  // --- sendTextMessage Tests ---
  describe('sendTextMessage', () => {
    const validChatId = '1234567890@c.us';
    const validText = 'Hello there!';
    const validInput = { chatId: validChatId, text: validText };

    it('should send message via API if user owns session', async () => {
      const caller = createCaller(userSession);
      const dbSession = { id: 'session-id-13', userId: userId, sessionName: WAHA_DEFAULT_SESSION_NAME, status: 'WORKING' as const, createdAt: new Date(), updatedAt: new Date() };
      const apiResponse = { id: 'waha-message-id-123' }; // Example API response

      mockDb.wahaSession.findFirst.mockResolvedValue(dbSession); // User owns session
      mockWahaClient.sendTextMessage.mockResolvedValue(apiResponse); // API send succeeds

      const result = await caller.sendTextMessage(validInput);

      expect(result).toEqual({ success: true, messageId: apiResponse.id, result: apiResponse });
      expect(mockDb.wahaSession.findFirst).toHaveBeenCalledWith({
        where: { userId: userId, sessionName: WAHA_DEFAULT_SESSION_NAME },
      });
      expect(mockWahaClient.sendTextMessage).toHaveBeenCalledWith(
        WAHA_DEFAULT_SESSION_NAME,
        validInput.chatId,
        validInput.text
      );
    });

    it('should throw error if WAHA API sendTextMessage fails', async () => {
      const caller = createCaller(userSession);
      const dbSession = { id: 'session-id-14', userId: userId, sessionName: WAHA_DEFAULT_SESSION_NAME, status: 'WORKING' as const, createdAt: new Date(), updatedAt: new Date() };
      const apiError = new Error("Rate limit exceeded");

      mockDb.wahaSession.findFirst.mockResolvedValue(dbSession); // User owns session
      mockWahaClient.sendTextMessage.mockRejectedValue(apiError); // API send fails

      await expect(caller.sendTextMessage(validInput)).rejects.toThrow(
        new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: apiError.message, // Router passes original message
          cause: apiError,
        })
      );
      expect(mockDb.wahaSession.findFirst).toHaveBeenCalledOnce();
      expect(mockWahaClient.sendTextMessage).toHaveBeenCalledOnce();
    });

    it('should throw FORBIDDEN if user does not own the session', async () => {
      const caller = createCaller(userSession);
      mockDb.wahaSession.findFirst.mockResolvedValue(null); // No session found for user

      await expect(caller.sendTextMessage(validInput)).rejects.toThrow(
        new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have an active WAHA session to send messages.',
        })
      );
      expect(mockDb.wahaSession.findFirst).toHaveBeenCalledOnce();
      expect(mockWahaClient.sendTextMessage).not.toHaveBeenCalled();
    });

    it('should throw UNAUTHORIZED if no user session provided', async () => {
      const caller = createCaller(null); // No user session

      await expect(caller.sendTextMessage(validInput)).rejects.toThrow(
        new TRPCError({ code: 'UNAUTHORIZED' })
      );
      expect(mockDb.wahaSession.findFirst).not.toHaveBeenCalled();
    });

     // Note: Zod input validation (e.g., invalid chatId format) is handled by tRPC before the resolver.
  });

});