import axios, { type AxiosInstance, AxiosError } from "axios";
import { env } from "~/env";

// Define possible statuses based on WAHA documentation/expected behavior
// Ref: https://waha.devlike.pro/docs/reference/sessions/#session-status
export type WAHASessionStatus =
  | "STARTING" // The session is starting, not confirmed yet
  | "SCAN_QR_CODE" // Need to scan the QR code
  | "WORKING" // Session is active and ready
  | "FAILED" // Session failed to start or encountered an error
  | "STOPPED" // Session was explicitly stopped
  | "PAIRING_CODE" // Need to enter pairing code (alternative to QR)
  | "OFFLINE" // Session is offline (e.g., phone disconnected) - WAHA might return this
  | "CONNECTING" // Session is attempting to connect
  | "TIMEOUT"; // Connection attempt timed out

// Interface for the result of getSessionStatus
export interface WahaSessionState {
  status: WAHASessionStatus;
  qr?: string; // Base64 QR code image data
  code?: string; // Pairing code
}

// Interface for file uploads (e.g., images)
export interface WahaFile {
  filename: string;
  base64: string; // Base64 encoded file content
  mimeType: string;
}

export class WahaApiClient {
  private readonly client: AxiosInstance;
  private readonly apiKey: string;

  constructor() {
    if (!env.WAHA_BASE_URL || !env.WAHA_API_KEY) {
      // This should technically be caught by env validation, but good practice
      throw new Error(
        "WAHA_BASE_URL and WAHA_API_KEY must be defined in environment variables.",
      );
    }
    this.apiKey = env.WAHA_API_KEY;
    this.client = axios.create({
      baseURL: env.WAHA_BASE_URL,
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": this.apiKey,
      },
    });

    // Optional: Add interceptors for logging or more complex error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        console.error(
          `WAHA API Error: ${error.response?.status} ${error.message}`,
          error.response?.data,
        );
        // Re-throw or handle specific errors
        return Promise.reject(error);
      },
    );
  }

  /**
   * Starts a new WhatsApp session or restarts an existing one.
   * @param sessionName Unique name for the session.
   */
  async startSession(sessionName: string): Promise<void> {
    try {
      // Send as JSON (reverting the form data attempt)
      await this.client.post(`/api/sessions/start`, { name: sessionName }, {
         // Explicitly setting header again just in case, though likely not needed
        headers: { 'Content-Type': 'application/json' }
      });
      console.log(`WAHA: Session '${sessionName}' start requested (as JSON).`);
    } catch (error: unknown) {
      // Check for the specific "already started" 422 error more robustly
      let isAlreadyStartedError = false;
      if (axios.isAxiosError(error) && error.response?.status === 422) {
        const responseData = error.response?.data;
        if (
          typeof responseData === 'object' &&
          responseData !== null &&
          'message' in responseData &&
          typeof responseData.message === 'string'
        ) {
          // Check if the message contains key phrases indicating it's already started
          const message = responseData.message.toLowerCase(); // Case-insensitive check
          if (message.includes(sessionName.toLowerCase()) && message.includes("already started")) {
             isAlreadyStartedError = true;
          }
        }
      }

      if (isAlreadyStartedError) {
         // Session is already started, which is fine. Log it and return successfully.
         // We know this must be an AxiosError because isAlreadyStartedError could only be true if the check passed earlier.
         // However, TS doesn't track that connection across scopes, so we re-assert the type guard here.
         if (axios.isAxiosError(error)) {
           console.warn(
             `WAHA: Caught 'already started' error for session '${sessionName}'. Condition met. Proceeding normally.`,
             error.response?.data, // Log the specific response data (now safe)
           );
         } else {
           // This case should theoretically be impossible if the logic determining isAlreadyStartedError is correct,
           // but log defensively just in case.
           console.warn(
             `WAHA: Caught 'already started' error for session '${sessionName}' but error type was unexpected. Proceeding normally.`,
             error, // Log the original unknown error
           );
         }
         return; // Exit the function successfully, don't throw
      }

      // Handle *other* errors (non-"already started" errors)
      let errorMessage = `Failed to start WAHA session '${sessionName}'.`;
      let statusCode = 'Unknown';
      let responseData = null;

      if (axios.isAxiosError(error)) {
        statusCode = error.response?.status?.toString() ?? 'N/A';
        responseData = error.response?.data ?? null;
        errorMessage = `Failed to start WAHA session '${sessionName}'. Status: ${statusCode}. Message: ${error.message}`;
        // Log detailed Axios error
        console.error(
          `WAHA: Axios error during startSession for '${sessionName}':`,
          {
            status: statusCode,
            message: error.message,
            data: responseData,
            config: error.config, // Log request config too
          }
        );
      } else if (error instanceof Error) {
        errorMessage = `Failed to start WAHA session '${sessionName}'. Error: ${error.message}`;
        console.error(
          `WAHA: Generic error during startSession for '${sessionName}':`, error
        );
      } else {
        console.error(
          `WAHA: Unknown error during startSession for '${sessionName}':`, error
        );
      }
      // Re-throw a more informative error for the tRPC router to handle
      const thrownError = new Error(errorMessage, { cause: error });
      // Attach status code and data if available for potential use in tRPC error formatting
      (thrownError as any).statusCode = statusCode;
      (thrownError as any).responseData = responseData;
      throw thrownError;
    }
  }

  /**
   * Retrieves the current status of a session, including QR code or pairing code if needed.
   * @param sessionName Name of the session.
   * @returns Current session state.
   */
  async getSessionStatus(sessionName: string): Promise<WahaSessionState> {
    try {
      const response = await this.client.get<{ status: WAHASessionStatus }>(
        `/api/sessions/${sessionName}`,
      );
      const status = response.data.status;
      console.log(`WAHA: Session '${sessionName}' status: ${status}`);

      let qr: string | undefined;
      let code: string | undefined;

      if (status === "SCAN_QR_CODE") {
        qr = (await this.getQrCode(sessionName)) ?? undefined; // Convert null to undefined
      } else if (status === "PAIRING_CODE") {
        // WAHA might return the code directly in the status or require a separate call
        // Assuming getSession might include it, or we need another method if not.
        // For now, let's assume it might need a separate call if not present.
        // code = await this.getPairingCode(sessionName); // Hypothetical method
        console.warn(
          `WAHA: Pairing code requested for session '${sessionName}', but fetching code is not fully implemented yet.`,
        );
      }

      return { status, qr, code };
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        console.log(`WAHA: Session '${sessionName}' not found.`);
        // Treat as effectively stopped or non-existent
        return { status: "STOPPED" };
      }
      console.error(
        `WAHA: Failed to get status for session '${sessionName}':`,
        error,
      );
      throw new Error(`Failed to get WAHA session status for '${sessionName}'.`);
    }
  }

  /**
   * Fetches the QR code for authentication.
   * @param sessionName Name of the session.
   * @returns Base64 encoded QR code image or null if not available/applicable.
   */
  async getQrCode(sessionName: string): Promise<string | null> {
    try {
      // Use the screenshot endpoint as suggested
      const response = await this.client.get<{ type: string; data: string }>(
        `/api/screenshot?session=${sessionName}`, // Use query parameter
        {
          // Expecting a JSON response like { type: 'Buffer', data: 'base64...' }
          // Axios should handle JSON parsing by default
        },
      );
      console.log(`WAHA: Screenshot (QR) fetched for session '${sessionName}'.`);
      // Extract the base64 data from the 'data' field
      return response.data?.data ?? null;
    } catch (error) {
      console.error(
        `WAHA: Failed to get screenshot (QR) for session '${sessionName}':`,
        error,
      );
      // Re-throw the error so the calling function knows it failed
      throw new Error(`Failed to get WAHA screenshot for '${sessionName}'.`, { cause: error });
    }
  }

  /**
   * Requests a pairing code for authentication via phone number.
   * @param sessionName Name of the session.
   * @param phoneNumber The phone number to link.
   * @returns The pairing code or null if failed.
   */
  async requestCode(
    sessionName: string,
    phoneNumber: string,
  ): Promise<string | null> {
    try {
      // Note: WAHA docs suggest this might be GET or POST depending on version/setup
      // Adjust if POST /api/sessions/{session}/auth/request-code is correct
      const response = await this.client.post<{ code: string }>(
        `/api/sessions/${sessionName}/auth/request-code`, // Assuming POST based on initial plan
        { phoneNumber }, // Send phone number in body
      );
      console.log(
        `WAHA: Pairing code requested for session '${sessionName}' and number ${phoneNumber}.`,
      );
      return response.data.code ?? null;
    } catch (error) {
      console.error(
        `WAHA: Failed to request pairing code for session '${sessionName}':`,
        error,
      );
      return null;
    }
  }

  /**
   * Logs out a session.
   * @param sessionName Name of the session.
   */
  async logoutSession(sessionName: string): Promise<void> {
    try {
      await this.client.post(`/api/sessions/${sessionName}/logout`);
      console.log(`WAHA: Logout requested for session '${sessionName}'.`);
    } catch (error) {
      console.error(`WAHA: Failed to logout session '${sessionName}':`, error);
      // Consider if throwing is needed or just logging
      throw new Error(`Failed to logout WAHA session '${sessionName}'.`);
    }
  }

  /**
   * Sends a text message.
   * @param sessionName Name of the session.
   * @param chatId Recipient chat ID (e.g., '1234567890@c.us').
   * @param text The message text.
   * @returns API response data.
   */
  async sendTextMessage(
    sessionName: string,
    chatId: string,
    text: string,
  ): Promise<any> {
    try {
      const response = await this.client.post(
        `/api/${sessionName}/sendText`, // Endpoint often includes session name
        { chatId, text },
      );
      console.log(
        `WAHA: Text message sent via session '${sessionName}' to ${chatId}.`,
      );
      return response.data;
    } catch (error) {
      console.error(
        `WAHA: Failed to send text message via session '${sessionName}':`,
        error,
      );
      throw new Error("Failed to send text message via WAHA.");
    }
  }

  /**
   * Sends an image message.
   * @param sessionName Name of the session.
   * @param chatId Recipient chat ID.
   * @param file The image file details (filename, base64, mimeType).
   * @param caption Optional caption for the image.
   * @returns API response data.
   */
  async sendImageMessage(
    sessionName: string,
    chatId: string,
    file: WahaFile,
    caption?: string,
  ): Promise<any> {
    try {
      // WAHA API might expect file details differently (e.g., under a 'file' key or direct)
      // Adjust payload based on actual WAHA API spec for sendImage
      const payload = {
        chatId,
        file: {
          mimetype: file.mimeType,
          filename: file.filename,
          data: file.base64, // Assuming WAHA expects base64 data directly
        },
        caption,
      };
      const response = await this.client.post(
        `/api/${sessionName}/sendImage`, // Endpoint often includes session name
        payload,
      );
      console.log(
        `WAHA: Image message sent via session '${sessionName}' to ${chatId}.`,
      );
      return response.data;
    } catch (error) {
      console.error(
        `WAHA: Failed to send image message via session '${sessionName}':`,
        error,
      );
      throw new Error("Failed to send image message via WAHA.");
    }
  }

  // Helper to potentially fetch pairing code if not included in status
  // async getPairingCode(sessionName: string): Promise<string | null> {
  //   // Implementation depends on how WAHA provides the pairing code
  //   // Might be another endpoint or part of the session status response
  //   console.warn(`getPairingCode for session '${sessionName}' not implemented.`);
  //   return null;
  // }
}

// Optional: Export a singleton instance if preferred
// export const wahaClient = new WahaApiClient();