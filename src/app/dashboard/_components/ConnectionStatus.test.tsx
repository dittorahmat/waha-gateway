import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionStatus } from './ConnectionStatus';
import { api } from '@/trpc/react'; // Import the mocked api

// Mock the tRPC hook
vi.mock('@/trpc/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/trpc/react')>();
  return {
    ...actual, // Use actual implementations for other hooks if needed
    api: {
      waha: {
        getSessionState: { // Corrected procedure name
          useQuery: vi.fn(), // Mock the useQuery hook
        },
        // Add mocks for other procedures if needed by the component
      },
    },
  };
});

// Cast the mocked hook for type safety
const mockedUseQuery = vi.mocked(api.waha.getSessionState.useQuery); // Corrected procedure name

describe('ConnectionStatus Component', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockedUseQuery.mockClear();
  });

  it('should render loading state', () => {
    mockedUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      trpc: {}, // Add required trpc property
    } as any); // Use 'any' for simplicity or import the actual complex type

    render(<ConnectionStatus />);
    expect(screen.getByText(/Loading status.../i)).toBeInTheDocument();
  });

  it('should render error state', () => {
    mockedUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed to fetch'),
      trpc: {}, // Add required trpc property
    } as any);

    render(<ConnectionStatus />);
    expect(screen.getByText(/Error loading status/i)).toBeInTheDocument();
    // Optionally check for the specific error message if displayed
    // expect(screen.getByText(/Failed to fetch/i)).toBeInTheDocument();
  });

  it('should render disconnected state', () => {
    // Define the expected data structure based on actual API response
    const mockData = { status: 'DISCONNECTED', connected: false };
    mockedUseQuery.mockReturnValue({
      data: mockData,
      isLoading: false,
      error: null,
      trpc: {}, // Add required trpc property
    } as any);

    render(<ConnectionStatus />);
    expect(screen.getByText(/Status: Disconnected/i)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /qr code/i })).not.toBeInTheDocument();
  });

   it('should render connected state', () => {
     const mockData = { status: 'CONNECTED', connected: true };
     mockedUseQuery.mockReturnValue({
       data: mockData,
       isLoading: false,
       error: null,
       trpc: {}, // Add required trpc property
     } as any);

     render(<ConnectionStatus />);
     expect(screen.getByText(/Status: Connected/i)).toBeInTheDocument();
     expect(screen.queryByRole('img', { name: /qr code/i })).not.toBeInTheDocument();
   });

   it('should render scan QR code state with QR image', () => {
     const fakeQrCode = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='; // Example base64
     const mockData = { status: 'SCAN_QR_CODE', qrCode: fakeQrCode, connected: false };
     mockedUseQuery.mockReturnValue({
       data: mockData,
       isLoading: false,
       error: null,
       trpc: {}, // Add required trpc property
     } as any);

     render(<ConnectionStatus />);
     expect(screen.getByText(/Status: Scan QR Code/i)).toBeInTheDocument();
     const qrImage = screen.getByRole('img', { name: /qr code/i });
     expect(qrImage).toBeInTheDocument();
     expect(qrImage).toHaveAttribute('src', fakeQrCode);
   });

  // TODO: Add tests for other potential statuses if they exist
  // TODO: Add tests for user interactions (e.g., clicking a reconnect button if available)
  // Add tests for loading states
  // Add tests for error states
});