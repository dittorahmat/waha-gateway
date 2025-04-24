import React from 'react';
import { vi } from 'vitest';

// Mock api.waha.getSessionState.useQuery before importing the component
vi.mock('@/trpc/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/trpc/react')>();
  return {
    ...actual,
    api: {
      waha: {
        sendTextMessage: {
          useMutation: vi.fn(),
        },
        getSessionState: {
          useQuery: vi.fn(() => {
            console.log('Mocked useQuery called');
            return { data: { connected: true, status: 'WORKING' } };
          }),
        },
      },
    },
  };
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import { SendMessageForm } from './SendMessageForm';
import { api } from '@/trpc/react';

// Cast the mocked hook for type safety
const mockedUseMutation = vi.mocked(api.waha.sendTextMessage.useMutation);
const mockMutate = vi.fn();


// Cast the mocked hook for type safety
const mockedUseMutation = vi.mocked(api.waha.sendTextMessage.useMutation);
const mockMutate = vi.fn(); // Mock function for the mutate call

describe('SendMessageForm Component', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    // Setup default mock return value for the mutation hook
    mockedUseMutation.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      // Add other properties returned by useMutation if needed by the component
    } as any); // Use 'any' or the specific return type
  });

  it('should render form elements correctly', async () => {
    render(<SendMessageForm />);

    // Check labels and inputs
    expect(screen.getByLabelText(/Recipient \(Chat ID\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Message/i)).toBeInTheDocument();

    // Check button
    expect(screen.getByRole('button', { name: /Send Message/i })).toBeInTheDocument();
  });

  it('should call sendTextMessage mutation with form values on submit', async () => {
    const user = userEvent.setup();
    render(<SendMessageForm />);

    const recipientInput = screen.getByLabelText(/Recipient \(Chat ID\)/i);
    const messageInput = screen.getByLabelText(/Message/i);
    const submitButton = screen.getByRole('button', { name: /Send Message/i });

    const testChatId = '1234567890@c.us';
    const testMessage = 'Hello from test!';

    await user.type(recipientInput, testChatId);
    await user.type(messageInput, testMessage);
    await user.click(submitButton);

    // Check if the mutate function was called correctly
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith({
      chatId: testChatId,
      text: testMessage,
    });
  });

  // TODO: Add tests for form submission success/error handling (e.g., showing toasts)
  // Add tests for input validation
  // Add tests for loading/pending states during submission
});