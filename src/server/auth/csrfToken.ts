import { randomBytes, timingSafeEqual } from 'crypto';

const CSRF_TOKEN_LENGTH = 32; // 32 bytes = 64 hex characters
// Ensure CSRF_SECRET is loaded from environment variables
const CSRF_SECRET = process.env.CSRF_SECRET;

if (!CSRF_SECRET) {
  // In a production environment, this should ideally be a more robust error handling mechanism
  // or a check during application startup.
  console.error("FATAL ERROR: CSRF_SECRET environment variable is not set.");
  // Depending on the application's error handling strategy, you might want to
  // throw an error here to prevent the application from starting without a secret.
  // For now, we'll log an error and continue, but this is not recommended for production.
  if (process.env.NODE_ENV === 'production') {
      throw new Error("CSRF_SECRET environment variable is not set in production.");
  }
}


/**
 * Generates a new CSRF token.
 * @returns {string} The generated CSRF token (hex encoded).
 */
export function generateCsrfToken(): string {
  // In a real application, you would generate this token and store it server-side (e.g., in a session)
  // when a form or page requiring CSRF protection is rendered.
  return randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

/**
 * Verifies a submitted CSRF token against the token stored in the user's session.
 * Uses timingSafeEqual to prevent timing attacks.
 *
 * @param {string} submittedToken The token submitted by the client (e.g., from a form field or header).
 * @param {any} session The user's session object, containing the stored CSRF token.
 * @returns {boolean} True if the tokens match, false otherwise.
 */
export function verifyCsrfToken(submittedToken: string, session: any): boolean {
  const expectedToken = session?.csrfToken; // Retrieve the token from the session

  if (!submittedToken || !expectedToken) {
    return false;
  }

  try {
    // Ensure both inputs are buffers of the same length before comparison
    const submittedBuffer = Buffer.from(submittedToken, 'utf8');
    const expectedBuffer = Buffer.from(expectedToken, 'utf8');

    if (submittedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    // Use timingSafeEqual to prevent timing attacks
    return timingSafeEqual(submittedBuffer, expectedBuffer);
  } catch (error) {
    console.error("Error during CSRF token verification:", error);
    return false;
  }
}

// Note: The generateCsrfToken function now only generates a token. The responsibility
// of storing it in the session and retrieving it for verification lies with the
// code that calls these functions (e.g., in your API routes or middleware).