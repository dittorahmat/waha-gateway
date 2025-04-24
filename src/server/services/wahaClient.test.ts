import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { WahaApiClient } from './wahaClient';
import { env } from '~/env'; // Import env to mock it

// Mock the env module
vi.mock('~/env', () => ({
  env: {
    WAHA_BASE_URL: 'http://fake-waha-url.com',
    WAHA_API_KEY: 'test-api-key',
  },
}));

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios, true); // Deep mock

describe('WahaApiClient Service', () => {
  let wahaClient: WahaApiClient;
  const sessionName = 'test-session';

  beforeEach(() => {
    // Provide default mock implementation for axios.create()
    // This mock axios instance will be used by the WahaApiClient
    const mockAxiosInstance = {
      post: vi.fn(),
      get: vi.fn(),
      interceptors: {
        response: { use: vi.fn() }, // Mock interceptor setup
      },
      // Add other methods if needed (put, delete, etc.)
    };
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);
    console.log('[TEST] mockAxiosInstance shape:', mockAxiosInstance);

    // Create a new instance after the mock is set up
    wahaClient = new WahaApiClient();
    // Reset mocks before each test run
    vi.clearAllMocks();
  });

  it('constructor should create axios instance with correct config', () => {
    // WahaApiClient is created in beforeEach
    expect(mockedAxios.create).toHaveBeenCalledTimes(1);
    expect(mockedAxios.create).toHaveBeenCalledWith({
      baseURL: env.WAHA_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': env.WAHA_API_KEY,
      },
    });
    // Check if interceptor was added (optional, depends on strictness)
    const mockAxiosInstance = mockedAxios.create.mock.results.at(-1)!.value; // Add ! assertion
    expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalledTimes(1);
  });

  describe('startSession', () => {
    it('should call POST /api/sessions/start with session name', async () => {
      const mockPost = vi.fn().mockResolvedValue({ data: {} }); // Mock successful response
      mockedAxios.create.mockReturnValue({ post: mockPost, interceptors: { response: { use: vi.fn() } } } as any);
      const testClient = new WahaApiClient(); // Recreate client with mocked post

      await testClient.startSession(sessionName);

      expect(mockPost).toHaveBeenCalledTimes(1);
      expect(mockPost).toHaveBeenCalledWith(
        '/api/sessions/start',
        { name: sessionName },
        { headers: { 'Content-Type': 'application/json' } }
      );
    });

    it('should not throw error if session is already started (422 error)', async () => {
      const errorResponse = {
        response: {
          status: 422,
          data: { message: `Session ${sessionName} already started.` },
        },
        isAxiosError: true, // Simulate AxiosError properties
      };
      const mockPost = vi.fn().mockRejectedValue(errorResponse);
      mockedAxios.create.mockReturnValue({ post: mockPost, interceptors: { response: { use: vi.fn() } } } as any);
      const testClient = new WahaApiClient();

      // Expect no error to be thrown
      await expect(testClient.startSession(sessionName)).resolves.toBeUndefined();
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    it('should throw error for other non-422 errors during start', async () => {
      const errorResponse = new Error('Request failed with status code 500');
      (errorResponse as any).isAxiosError = true;
      (errorResponse as any).response = { status: 500, data: { message: 'Internal Server Error' } };
      (errorResponse as any).message = 'Request failed with status code 500';
      const mockPost = vi.fn().mockRejectedValue(errorResponse);
      mockedAxios.create.mockReturnValue({ post: mockPost, interceptors: { response: { use: vi.fn() } } } as any);
      const testClient = new WahaApiClient();

      await expect(testClient.startSession(sessionName)).rejects.toThrow(
        `Failed to start WAHA session '${sessionName}'. Status: 500. Message: Request failed with status code 500`
      );
      expect(mockPost).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSessionStatus', () => {
    it('should call GET /api/sessions/{sessionName} and return status', async () => {
      const mockGetResponse = { data: { status: 'WORKING' } };
      const mockGet = vi.fn().mockResolvedValue(mockGetResponse);
      // Get the mocked instance created in beforeEach
      mockedAxios.create.mockReturnValue({ get: mockGet, interceptors: { response: { use: vi.fn() } } } as any);
      const testClient = new WahaApiClient();
      const mockAxiosInstance = mockedAxios.create.mock.results.at(-1)!.value;
      mockAxiosInstance.get = mockGet; // Assign mock get to the instance

      const result = await testClient.getSessionStatus(sessionName);

      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockGet).toHaveBeenCalledWith(`/api/sessions/${sessionName}`);
      expect(result).toEqual({ status: 'WORKING', qr: undefined, code: undefined });
    });

    it('should fetch QR code if status is SCAN_QR_CODE', async () => {
      const statusResponse = { data: { status: 'SCAN_QR_CODE' } };
      const qrResponse = { data: { data: 'fake-base64-qr' } }; // Screenshot endpoint format
      const mockGet = vi.fn()
        .mockResolvedValueOnce(statusResponse) // First call for status
        .mockResolvedValueOnce(qrResponse);   // Second call for QR
      mockedAxios.create.mockReturnValue({ get: mockGet, interceptors: { response: { use: vi.fn() } } } as any);
      const testClient = new WahaApiClient();
      const mockAxiosInstance = mockedAxios.create.mock.results.at(-1)!.value;
      mockAxiosInstance.get = mockGet;

      const result = await testClient.getSessionStatus(sessionName);

      expect(mockGet).toHaveBeenCalledTimes(2);
      expect(mockGet).toHaveBeenNthCalledWith(1, `/api/sessions/${sessionName}`);
      expect(mockGet).toHaveBeenNthCalledWith(2, `/api/screenshot?session=${sessionName}`, {}); // Check screenshot call
      expect(result).toEqual({
        status: 'SCAN_QR_CODE',
        qr: 'data:image/png;base64,fake-base64-qr',
        code: undefined,
      });
    });

    it('should return status STOPPED if session fetch returns 404', async () => {
      const errorResponse = {
        response: { status: 404 },
        isAxiosError: true,
      };
      const mockGet = vi.fn().mockRejectedValue(errorResponse);
      const testClient = new WahaApiClient();
      const mockAxiosInstance = mockedAxios.create.mock.results.at(-1)!.value;
      mockAxiosInstance.get = mockGet;

      const result = await testClient.getSessionStatus(sessionName);

      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockGet).toHaveBeenCalledWith(`/api/sessions/${sessionName}`);
      expect(result).toEqual({ status: 'STOPPED' });
    });

    it('should throw error for non-404 errors during status fetch', async () => {
      const errorResponse = new Error('Request failed with status code 500');
      (errorResponse as any).isAxiosError = true;
      (errorResponse as any).response = { status: 500 };
      const mockGet = vi.fn().mockRejectedValue(errorResponse);
      const testClient = new WahaApiClient();
      const mockAxiosInstance = mockedAxios.create.mock.results.at(-1)!.value;
      mockAxiosInstance.get = mockGet;

      await expect(testClient.getSessionStatus(sessionName)).rejects.toThrow(
        `Failed to get WAHA session status for '${sessionName}'.`
      );
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it('should throw error if QR code fetch fails', async () => {
      const statusResponse = { data: { status: 'SCAN_QR_CODE' } };
      const qrErrorResponse = new Error('QR fetch failed');
      (qrErrorResponse as any).isAxiosError = true;
      (qrErrorResponse as any).response = { status: 500 };
      (qrErrorResponse as any).message = 'QR fetch failed';
      const mockGet = vi.fn()
        .mockResolvedValueOnce(statusResponse) // First call for status
        .mockRejectedValueOnce(qrErrorResponse); // Second call for QR fails
      const testClient = new WahaApiClient();
      const mockAxiosInstance = mockedAxios.create.mock.results.at(-1)!.value;
      mockAxiosInstance.get = mockGet;
          response: { status: 500 },
          isAxiosError: true,
          message: 'QR fetch failed',
        };
        const mockGet = vi.fn()
          .mockResolvedValueOnce(statusResponse) // First call for status
          .mockRejectedValueOnce(qrErrorResponse); // Second call for QR fails
        const testClient = new WahaApiClient();
        const mockAxiosInstance = mockedAxios.create.mock.results.at(-1)!.value;
        mockAxiosInstance.get = mockGet;

        // The error from getQrCode should propagate
        await expect(testClient.getSessionStatus(sessionName)).rejects.toThrow(
          `Failed to get WAHA screenshot for '${sessionName}'.`
        );
        expect(mockGet).toHaveBeenCalledTimes(2); // Both calls attempted
      });
  });

  describe('logoutSession', () => {
    it('should call POST /api/sessions/{sessionName}/logout', async () => {
      const mockPost = vi.fn().mockResolvedValue({ data: {} });
      mockedAxios.create.mockReturnValue({ post: mockPost, interceptors: { response: { use: vi.fn() } } } as any);
      const testClient = new WahaApiClient();
      const mockAxiosInstance = mockedAxios.create.mock.results.at(-1)!.value;
      mockAxiosInstance.post = mockPost;

      await testClient.logoutSession(sessionName);

      expect(mockPost).toHaveBeenCalledTimes(1);
      expect(mockPost).toHaveBeenCalledWith(`/api/sessions/${sessionName}/logout`);
    });

    it('should throw error if logout fails', async () => {
      const errorResponse = { response: { status: 500 }, isAxiosError: true };
      const mockPost = vi.fn().mockRejectedValue(errorResponse);
      const testClient = new WahaApiClient();
      const mockAxiosInstance = mockedAxios.create.mock.results.at(-1)!.value;
      mockAxiosInstance.post = mockPost;

      await expect(testClient.logoutSession(sessionName)).rejects.toThrow(
        `Failed to logout WAHA session '${sessionName}'.`
      );
      expect(mockPost).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendTextMessage', () => {
    const chatId = '12345@c.us';
    const text = 'Hello Test';

    it('should call POST /api/{sessionName}/sendText with correct payload', async () => {
      const mockPost = vi.fn().mockResolvedValue({ data: { id: 'msg1' } });
      mockedAxios.create.mockReturnValue({ post: mockPost, interceptors: { response: { use: vi.fn() } } } as any);
      const testClient = new WahaApiClient();
      const mockAxiosInstance = mockedAxios.create.mock.results.at(-1)!.value;
      mockAxiosInstance.post = mockPost;

      const result = await testClient.sendTextMessage(sessionName, chatId, text);

      expect(mockPost).toHaveBeenCalledTimes(1);
      expect(mockPost).toHaveBeenCalledWith(
        `/api/${sessionName}/sendText`,
        { chatId, text }
      );
      expect(result).toEqual({ id: 'msg1' });
    });

    it('should throw error if sending text fails', async () => {
      const errorResponse = { response: { status: 400 }, isAxiosError: true };
      const mockPost = vi.fn().mockRejectedValue(errorResponse);
      const testClient = new WahaApiClient();
      const mockAxiosInstance = mockedAxios.create.mock.results.at(-1)!.value;
      mockAxiosInstance.post = mockPost;

      await expect(testClient.sendTextMessage(sessionName, chatId, text)).rejects.toThrow(
        "Failed to send text message via WAHA."
      );
      expect(mockPost).toHaveBeenCalledTimes(1);
    });
  });

  describe('requestCode', () => {
    const phoneNumber = '+1234567890';

    it('should call POST /api/sessions/{sessionName}/auth/request-code', async () => {
      const mockResponse = { data: { code: '123-456' } };
      const mockPost = vi.fn().mockResolvedValue(mockResponse);
      const testClient = new WahaApiClient();
      const mockAxiosInstance = mockedAxios.create.mock.results.at(-1)!.value;
      mockAxiosInstance.post = mockPost;

      const result = await testClient.requestCode(sessionName, phoneNumber);

      expect(mockPost).toHaveBeenCalledTimes(1);
      expect(mockPost).toHaveBeenCalledWith(
        `/api/sessions/${sessionName}/auth/request-code`,
        { phoneNumber }
      );
      expect(result).toBe('123-456');
    });

    it('should return null if requesting code fails', async () => {
      const errorResponse = { response: { status: 500 }, isAxiosError: true };
      const mockPost = vi.fn().mockRejectedValue(errorResponse);
      const testClient = new WahaApiClient();
      const mockAxiosInstance = mockedAxios.create.mock.results.at(-1)!.value;
      mockAxiosInstance.post = mockPost;

      const result = await testClient.requestCode(sessionName, phoneNumber);

      expect(mockPost).toHaveBeenCalledTimes(1);
      expect(result).toBeNull();
    });
  });

  describe('sendImageMessage', () => {
    const chatId = '98765@c.us';
    const file = {
      filename: 'test.png',
      base64: 'fake-base64-image-data',
      mimeType: 'image/png',
    };
    const caption = 'Test Image Caption';

    it('should call POST /api/{sessionName}/sendImage with correct payload', async () => {
      const mockResponse = { data: { id: 'imgMsg1' } };
      const mockPost = vi.fn().mockResolvedValue(mockResponse);
      mockedAxios.create.mockReturnValue({ post: mockPost, interceptors: { response: { use: vi.fn() } } } as any);
      const testClient = new WahaApiClient();
      const mockAxiosInstance = mockedAxios.create.mock.results.at(-1)!.value;
      mockAxiosInstance.post = mockPost;

      const result = await testClient.sendImageMessage(sessionName, chatId, file, caption);

      expect(mockPost).toHaveBeenCalledTimes(1);
      expect(mockPost).toHaveBeenCalledWith(
        `/api/${sessionName}/sendImage`,
        {
          chatId,
          file: {
            mimetype: file.mimeType,
            filename: file.filename,
            data: file.base64,
          },
          caption,
        }
      );
      expect(result).toEqual({ id: 'imgMsg1' });
    });

     it('should throw error if sending image fails', async () => {
       const errorResponse = { response: { status: 400 }, isAxiosError: true };
       const mockPost = vi.fn().mockRejectedValue(errorResponse);
       const testClient = new WahaApiClient();
       const mockAxiosInstance = mockedAxios.create.mock.results.at(-1)!.value;
       mockAxiosInstance.post = mockPost;

       await expect(testClient.sendImageMessage(sessionName, chatId, file, caption)).rejects.toThrow(
         "Failed to send image message via WAHA."
       );
       expect(mockPost).toHaveBeenCalledTimes(1);
     });
  });
});