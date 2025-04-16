import { z } from "zod";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import { type PrismaClient } from "@prisma/client"; // Keep type import if needed elsewhere

// Import the db instance directly
import { db } from "~/server/db";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

// Define the input schema separately for reusability if needed
const signupInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters long"),
});

// Extracted user creation logic - now uses imported 'db'
export async function createUserWithHashedPassword(
  input: z.infer<typeof signupInputSchema>
) {
  const { email, password } = input;

  // Check if user already exists using the imported db
  const existingUser = await db.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'User with this email already exists',
    });
  }

  // Hash the password
  const hashedPassword = await bcrypt.hash(password, 10); // Salt rounds = 10

  // Create the user using the imported db
  const user = await db.user.create({
    data: {
      email,
      password: hashedPassword,
      // Add other default fields if necessary, e.g., name
    },
  });

  // Return minimal user info, excluding password
  return {
    id: user.id,
    email: user.email,
  };
}


export const authRouter = createTRPCRouter({
  signup: publicProcedure
    .input(signupInputSchema) // Use the defined schema
    .mutation(async ({ input }) => { // No longer need ctx.db here
      // Call the extracted function
      return createUserWithHashedPassword(input);
    }),
});