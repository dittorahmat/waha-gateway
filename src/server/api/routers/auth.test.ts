import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUserWithHashedPassword } from './auth'; // Import the function to test
import { type User } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import bcrypt from 'bcryptjs'; // Import bcrypt to check its mock
import { db } from '../../db'; // Import the actual db instance (will be mocked)

// --- Mocking Section ---

// Mock the entire '~/server/db' module with simplified implementations
vi.mock('~/server/db', () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Mock the 'bcryptjs' module
vi.mock('bcryptjs', async (importOriginal) => {
    // Import the original module to potentially spread its other exports
    const actualBcrypt = await importOriginal<typeof import('bcryptjs')>();
    // Define the mock function *inside* the factory
    const mockHash = vi.fn(async (password: string, salt: string | number) => {
        const saltRounds = typeof salt === 'number' ? salt : 10;
        return Promise.resolve(`hashed_${password}_${saltRounds}`); // Default implementation
    });
    return {
        // Provide a default export containing the mocked hash
        default: {
            ...actualBcrypt, // Spread other exports from the original module
            hash: mockHash, // Override hash with our mock
        },
        // Also provide named export for hash if needed
        hash: mockHash,
    };
});

// --- Test Suite ---

describe('createUserWithHashedPassword', () => {
  // Get typed mocks using vi.mocked
  const mockedDbUserFindUnique = vi.mocked(db.user.findUnique);
  const mockedDbUserCreate = vi.mocked(db.user.create);
  const mockedBcryptHash = vi.mocked(bcrypt.hash);

  // Define a more complete mock user structure for type safety
  const mockUser: User = {
      id: 'mock-user-id',
      email: 'mock@example.com',
      password: 'mock-hashed-password',
      name: null,
      emailVerified: null,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
  };


  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Reset default implementations
    mockedDbUserFindUnique.mockResolvedValue(null);
    // Provide a more complete object to satisfy the type checker for mockResolvedValue
    mockedDbUserCreate.mockResolvedValue({ ...mockUser });
    // Reset bcrypt hash mock implementation
    mockedBcryptHash.mockImplementation(async (password: string, salt: string | number) => {
        const saltRounds = typeof salt === 'number' ? salt : 10;
        return Promise.resolve(`hashed_${password}_${saltRounds}`);
    });
  });

  it('should call bcrypt.hash with the correct password and salt rounds', async () => {
    // Arrange
    const input = {
      email: 'test@example.com',
      password: 'password123',
    };
    // This is the value our bcrypt mock will return for this input
    const expectedHashedPassword = 'hashed_password123_10';

    // Override the create mock's return value for this specific test if needed,
    // otherwise it uses the default from beforeEach
    mockedDbUserCreate.mockResolvedValue({ ...mockUser, id: 'user-123', email: input.email });


    // Act
    const result = await createUserWithHashedPassword(input);

    // Assert
    expect(mockedDbUserFindUnique).toHaveBeenCalledTimes(1);
    expect(mockedDbUserFindUnique).toHaveBeenCalledWith({ where: { email: input.email } });

    // *** Focus assertion on bcrypt.hash ***
    expect(mockedBcryptHash).toHaveBeenCalledTimes(1);
    expect(mockedBcryptHash).toHaveBeenCalledWith(input.password, 10); // Check password and salt

    // Verify create was called with the expected hashed password
    expect(mockedDbUserCreate).toHaveBeenCalledTimes(1);
    expect(mockedDbUserCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        email: input.email,
        // Use the known expected value from the mock
        password: expectedHashedPassword,
      },
    }));

    // Assert the function's return value
    expect(result).toEqual({
      id: 'user-123', // Matches the overridden mockResolvedValue
      email: input.email,
    });
  });

  it('should not call bcrypt.hash or db.create if the user already exists', async () => {
    // Arrange
    const input = {
      email: 'existing@example.com',
      password: 'password123',
    };
    // Override findUnique for this test
    mockedDbUserFindUnique.mockResolvedValue({
        ...mockUser, // Use spread for base fields
        id: 'user-456',
        email: input.email,
        password: 'somehashedpassword',
    });

    // Act & Assert
    await expect(createUserWithHashedPassword(input)).rejects.toThrowError(
      new TRPCError({
        code: 'CONFLICT',
        message: 'User with this email already exists',
      })
    );

    // Verify findUnique was called
    expect(mockedDbUserFindUnique).toHaveBeenCalledTimes(1);
    expect(mockedDbUserFindUnique).toHaveBeenCalledWith({ where: { email: input.email } });

    // *** Verify hash and create were NOT called ***
    expect(mockedBcryptHash).not.toHaveBeenCalled();
    expect(mockedDbUserCreate).not.toHaveBeenCalled();
  });
});