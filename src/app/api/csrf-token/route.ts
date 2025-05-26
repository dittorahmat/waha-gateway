import { NextResponse } from 'next/server';
import { generateCsrfToken } from '../../../server/auth/csrfToken'; // Assuming a new utility for token generation

export async function GET() {
  const csrfToken = generateCsrfToken(); // Implement this function
  return NextResponse.json({ csrfToken });
}