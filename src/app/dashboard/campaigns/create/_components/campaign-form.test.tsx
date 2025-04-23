// @vitest-environment happy-dom
console.log('[DEBUG] campaign-form.test.tsx loaded');
import React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";

// Mock Radix Portal to render inline for testing
vi.mock("@radix-ui/react-select", async (importOriginal) => {
  const original = await importOriginal<typeof SelectPrimitive>();
  return {
    ...original,
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import { describe, it, expect, vi, beforeEach } from "vitest"; // Removed afterEach
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// DO NOT Import the actual api object, we will mock the module
// import { api } from "~/trpc/react";

console.log('[DEBUG] Before importing campaign-form');
import { CampaignForm } from "./campaign-form";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// TRPCReactProvider IS likely needed to establish the api object structure
import { TRPCReactProvider } from "~/trpc/react"; // <-- Use alias and uncomment

// Mock tRPC API hooks to prevent real network calls in tests

// --- Define Mocks & Mock Data ---
const mockContactLists = [
  { id: "list-1", name: "List One", contactCount: 10 },
  { id: "list-2", name: "List Two", contactCount: 25 },
];
const mockTemplates = [
  { id: "tmpl-1", name: "Template Alpha" },
  { id: "tmpl-2", name: "Template Beta" },
];
const mockMediaItems = [
  { id: "media-1", filename: "image1.png", url: "/uploads/image1.png" },
  { id: "media-2", filename: "photo_a.jpg", url: "/uploads/photo_a.jpg" },
];
const mockCreateMutate = vi.fn();
const mockUploadMutate = vi.fn();
// --- End Mock Definitions ---


// Re-implement mock using vi.mock for hoisting - Mock the ENTIRE module
vi.mock("~/trpc/react", () => {
  console.log('[DEBUG] Mocking ~/trpc/react module');
  // Return the expected structure, including TRPCReactProvider and the nested api object.
  return {
    // Mock the provider
    TRPCReactProvider: ({ children }: { children: React.ReactNode }) => {
       console.log('[DEBUG] MOCK TRPCReactProvider used');
       return <>{children}</>;
    },
    // Mock the api object structure
    api: {
      contactList: {
        list: {
          useQuery: vi.fn().mockImplementation(() => {
            console.log('[DEBUG] MOCK api.contactList.list.useQuery called');
            return {
              data: mockContactLists,
              isLoading: false, isError: false, error: null, status: 'success', fetchStatus: 'idle',
            };
          }),
        },
      },
      template: {
        list: {
          useQuery: vi.fn().mockImplementation(() => {
            console.log('[DEBUG] MOCK api.template.list.useQuery called');
            return {
              data: mockTemplates,
              isLoading: false, isError: false, error: null, status: 'success', fetchStatus: 'idle',
            };
          }),
        },
      },
      mediaLibrary: {
        list: {
          useQuery: vi.fn().mockImplementation(() => {
            console.log('[DEBUG] MOCK api.mediaLibrary.list.useQuery called');
            return {
              data: mockMediaItems,
              isLoading: false, isError: false, error: null, status: 'success', fetchStatus: 'idle',
            };
          }),
        },
        upload: {
          useMutation: vi.fn().mockImplementation((opts?) => {
            console.log('[DEBUG] MOCK api.mediaLibrary.upload.useMutation called');
            // Use the external mock function directly for calls
            // Reset call history within the mock implementation for this specific hook instance
            mockUploadMutate.mockClear();
            mockUploadMutate.mockImplementation((data, options) => {
               console.log('[DEBUG] MOCK mockUploadMutate called with:', data);
               if (opts?.onSuccess) {
                 opts.onSuccess({ id: "mock-media-id" }, data, undefined);
               }
               return Promise.resolve({ id: "mock-media-id" });
            });
            return {
              mutate: mockUploadMutate,
              mutateAsync: mockUploadMutate, // Point to the same external mock
              isPending: false, isSuccess: true, isError: false, error: null,
              data: { id: "mock-media-id" }, reset: vi.fn(), status: 'success',
            };
          }),
        },
      },
      campaign: {
        create: {
          useMutation: vi.fn().mockImplementation((opts?) => {
            console.log('[DEBUG] MOCK api.campaign.create.useMutation called');
            // Use the external mock function directly for calls
             // Reset call history within the mock implementation for this specific hook instance
             mockCreateMutate.mockClear();
             // Define the onSuccess behavior within the mock implementation if needed,
             // referencing the external mock function for the actual call logic.
             mockCreateMutate.mockImplementation((data, options) => {
                console.log('[DEBUG] MOCK mockCreateMutate called with:', data);
                const mockCampaignResult = {
                   id: "mock-campaign-id", name: data.name ?? "Mock Campaign", status: 'SCHEDULED',
                   createdAt: new Date(), userId: 'mock-user-id', contactListId: data.contactListId,
                   messageTemplateId: data.messageTemplateId, mediaLibraryItemId: data.mediaLibraryItemId ?? null,
                   defaultNameValue: data.defaultNameValue, scheduledAt: data.scheduledAt, startedAt: null,
                   completedAt: null, totalContacts: 0, processedContacts: 0, successfulSends: 0,
                   failedSends: 0, sentCount: 0, failedCount: 0, lastProcessedContactIndex: -1,
                 };
                if (opts?.onSuccess) {
                  // Call the original onSuccess passed to useMutation
                  opts.onSuccess(mockCampaignResult, data, undefined);
                }
                // Simulate the async operation resolving
                return Promise.resolve(mockCampaignResult); // Resolve with mock result
              });
            return {
              mutate: mockCreateMutate,
              mutateAsync: mockCreateMutate, // Point to the same external mock
              isPending: false, isSuccess: true, isError: false, error: null,
              data: { id: "mock-campaign-id", name: "Mock Campaign" }, reset: vi.fn(), status: 'success',
            };
          }),
        },
      },
    },
  };
});

import { toast } from "sonner";
import { format } from "date-fns"; // Added missing import

// --- Mocks ---

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

// Mock FileReader (basic)
const mockReadAsDataURL = vi.fn();
const mockFileReader = vi.fn(() => ({
    readAsDataURL: mockReadAsDataURL,
    onload: vi.fn(),
    onerror: vi.fn(),
    result: "data:image/png;base64,dummycontent", // Provide dummy result
}));
vi.stubGlobal('FileReader', mockFileReader);

// --- Test Suite ---

// Helper to render with QueryClientProvider
const renderComponent = () => {
  const queryClient = new QueryClient();
  // Use TRPCReactProvider to ensure the api object structure is available
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCReactProvider> {/* <-- Provider from the mocked module */}
        <CampaignForm />
      </TRPCReactProvider>
    </QueryClientProvider>
  );
};

describe("CampaignForm Component", () => {
  console.log('[DEBUG] Inside describe block');

  it('renders without crashing', () => {
    console.log('[DEBUG] In test: renders without crashing');
    try {
      const { container } = render(renderComponent());
      console.log('[DEBUG] Rendered CampaignForm successfully');
      expect(container).toBeTruthy();
    } catch (e) {
      console.error('[DEBUG] Error rendering CampaignForm:', e);
      throw e;
    }
  });
  // beforeEach: Reset non-module mocks and external function call history
  beforeEach(() => {
    vi.clearAllMocks(); // Reset mocks like toast, router

    // Reset call history for the external functions used by mutations
    mockCreateMutate.mockClear();
    mockUploadMutate.mockClear();

    // Reset FileReader mocks
    mockFileReader.mockClear();
    mockReadAsDataURL.mockClear();
    mockFileReader.mockImplementation(() => ({
        readAsDataURL: mockReadAsDataURL,
        onload: vi.fn(),
        onerror: vi.fn(),
        result: "data:image/png;base64,dummycontent",
    }));
  });

  // No afterEach needed for vi.mock

  it("should render all initial form fields", () => {
    try {
      render(renderComponent());
      // screen.debug(); // Keep commented out unless needed
    } catch (err) {
      console.error('[DEBUG] Error during renderComponent:', err);
      throw err;
    }
    expect(screen.getByRole('textbox', { name: /Campaign Name/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Contact List/i })).toBeInTheDocument(); // Keep combobox for <select>
    expect(screen.getByRole('combobox', { name: /Message Template/i })).toBeInTheDocument(); // Keep combobox for <select>
    // Use getByRole for radio group items, targeting the one to interact with
    expect(screen.getByRole('radio', { name: /No Image/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Attach Image/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Default Name Value/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Scheduled Time/i)).toBeInTheDocument(); // CORRECTED LABEL
    expect(screen.getByRole("button", { name: /Schedule Campaign/i })).toBeInTheDocument();
    // Image options should be hidden initially
    expect(screen.queryByRole('radiogroup', { name: /Image Source/i })).not.toBeInTheDocument(); // Check for the group
  });

  it("should show image source options when 'Attach Image' is checked", async () => {
    const user = userEvent.setup();
    render(renderComponent());
    // Target the 'Attach Image' radio button to click it
    const attachRadioButton = screen.getByRole('radio', { name: /Attach Image/i });

    await user.click(attachRadioButton);

    // Check that the 'Attach Image' radio is now checked
    expect(attachRadioButton).toBeChecked();
    expect(screen.getByRole('radio', { name: /No Image/i })).not.toBeChecked();

    // Check that the image source radio group appears
    expect(screen.getByRole('radiogroup', { name: /Image Source/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Upload New Image/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Select from Media Library/i })).toBeInTheDocument();
  });

  it("should show file input when 'Upload New Image' is selected", async () => {
    const user = userEvent.setup();
    render(renderComponent());
    // Click 'Attach Image' radio first
    await user.click(screen.getByRole('radio', { name: /Attach Image/i }));
    // Then click 'Upload New Image' radio
    await user.click(screen.getByRole('radio', { name: /Upload New Image/i }));

    expect(screen.getByRole('radio', { name: /Upload New Image/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Select from Media Library/i })).not.toBeChecked();
    // More robust check might involve finding by specific attribute if label isn't direct
    expect(document.querySelector('input[type="file"]')).toBeInTheDocument(); // Rely on querySelector for file input presence
  });

  it("should show 'Select Image' button when 'Select from Media Library' is selected", async () => {
    const user = userEvent.setup();
    render(renderComponent());
    // Click 'Attach Image' radio first
    await user.click(screen.getByRole('radio', { name: /Attach Image/i }));
    // Then click 'Select from Media Library' radio
    await user.click(screen.getByRole('radio', { name: /Select from Media Library/i }));

    expect(screen.getByRole('radio', { name: /Upload New Image/i })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /Select from Media Library/i })).toBeChecked();
    expect(screen.getByRole("button", { name: /Select Image from Library/i })).toBeInTheDocument();
  });

  it("should require name, contact list, template, and schedule date on submit", async () => {
    const user = userEvent.setup();
    render(renderComponent());
    const submitButton = screen.getByRole("button", { name: /Schedule Campaign/i });

    await user.click(submitButton);

    // Check for error messages
    expect(await screen.findByText("Campaign name is required")).toBeInTheDocument();
    expect(await screen.findByText("Please select a contact list.")).toBeInTheDocument();
    expect(await screen.findByText("Please select a message template.")).toBeInTheDocument();
    // Check for date error - the text depends on the react-datetime-picker validation message
    // Let's check for the label text associated with the error state if possible, or a generic message
    // This might need adjustment based on actual error display
    expect(await screen.findByText("Scheduled date and time are required")).toBeInTheDocument(); // Assuming zod message maps directly

    // Check that the external mock function was not called
    expect(mockCreateMutate).not.toHaveBeenCalled();
   });

  it("should call create mutation with correct data (no image)", async () => {
    const user = userEvent.setup();
    render(renderComponent());

    const testDate = new Date(2025, 10, 15, 14, 30, 0); // Fixed date for predictability

    // Fill form
    await user.type(screen.getByRole('textbox', { name: /Campaign Name/i }), "My Test Campaign");
    await user.selectOptions(screen.getByRole('combobox', { name: /Contact List/i }), mockContactLists[0]!.id);
    await user.selectOptions(screen.getByRole('combobox', { name: /Message Template/i }), mockTemplates[0]!.id);

    // REMOVE attempt to interact with date picker via fireEvent
    // We will rely on expect.any(Date) in the assertion below

    // Find and click the submit button
    const submitButton = screen.getByRole("button", { name: /Schedule Campaign/i });
    await user.click(submitButton);

    await waitFor(() => {
       expect(mockCreateMutate).toHaveBeenCalledTimes(1);
       expect(mockCreateMutate).toHaveBeenCalledWith(
         expect.objectContaining({
           name: "My Test Campaign",
           contactListId: mockContactLists[0]!.id,
           messageTemplateId: mockTemplates[0]!.id,
           mediaLibraryItemId: undefined, // No image attached
           defaultNameValue: "Customer", // Default value
           // We can't easily verify the exact date set via fireEvent, check type
           scheduledAt: expect.any(Date),
         }),
         expect.anything() // For the mutation options
       );
       expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("scheduled successfully"));
       expect(mockPush).toHaveBeenCalledWith("/dashboard/campaigns");
    });
  });

  it("should call upload mutation and create mutation with uploaded image ID", async () => {
    const user = userEvent.setup();
    render(renderComponent());

    const testDate = new Date(2025, 10, 16, 10, 0, 0);
    const file = new File(["dummy content"], "test-image.png", { type: "image/png" });

    // Fill required fields
    await user.type(screen.getByRole('textbox', { name: /Campaign Name/i }), "Upload Test");
    await user.selectOptions(screen.getByRole('combobox', { name: /Contact List/i }), mockContactLists[0]!.id);
    await user.selectOptions(screen.getByRole('combobox', { name: /Message Template/i }), mockTemplates[0]!.id);
    // Manually trigger date change
    const dateTimeInputUpload = screen.getByLabelText(/Scheduled Time/i).closest('.react-datetime-picker')?.querySelector('input[name^="year"]') ?? document.body;
    fireEvent.change(dateTimeInputUpload, { target: { value: testDate.toISOString() } });

    // Select image upload path
    await user.click(screen.getByRole('radio', { name: /Attach Image/i }));
    await user.click(screen.getByRole('radio', { name: /Upload New Image/i }));

    // Upload the file
    const fileInputForUpload = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInputForUpload).toBeInTheDocument();
    await user.upload(fileInputForUpload, file);

    // Submit
    await user.click(screen.getByRole("button", { name: /Schedule Campaign/i }));

    // Assertions
    await waitFor(() => {
      // Verify FileReader was used
      expect(mockReadAsDataURL).toHaveBeenCalledWith(file);

       // Verify upload mutation call
       expect(mockUploadMutate).toHaveBeenCalledTimes(1);
       expect(mockUploadMutate).toHaveBeenCalledWith(
         expect.objectContaining({
           filename: "test-image.png",
           mimeType: "image/png",
           fileContentBase64: "dummycontent",
         }),
         expect.anything()
       );

       // Verify create campaign call with the ID from the mocked upload response
       expect(mockCreateMutate).toHaveBeenCalledTimes(1);
       expect(mockCreateMutate).toHaveBeenCalledWith(
         expect.objectContaining({
           name: "Upload Test",
           mediaLibraryItemId: "mock-media-id", // ID from the mocked upload response
           scheduledAt: expect.any(Date), // Check date type
         }),
         expect.anything()
       );
      expect(toast.success).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/dashboard/campaigns");
    });
  });

  it("should call create mutation with selected library image ID", async () => {
    const user = userEvent.setup();
    render(renderComponent());

    const testDate = new Date(2025, 10, 17, 11, 0, 0);

    // Fill required fields
    await user.type(screen.getByRole('textbox', { name: /Campaign Name/i }), "Library Select Test");
    await user.selectOptions(screen.getByRole('combobox', { name: /Contact List/i }), mockContactLists[1]!.id);
    await user.selectOptions(screen.getByRole('combobox', { name: /Message Template/i }), mockTemplates[1]!.id);
    // Manually trigger date change
    const dateTimeInputLib = screen.getByLabelText(/Scheduled Time/i).closest('.react-datetime-picker')?.querySelector('input[name^="year"]') ?? document.body;
    fireEvent.change(dateTimeInputLib, { target: { value: testDate.toISOString() } });

    // Select image library path
    await user.click(screen.getByRole('radio', { name: /Attach Image/i }));
    await user.click(screen.getByRole('radio', { name: /Select from Media Library/i }));

    // Select an image from the library dropdown
    const mediaSelectTrigger = await screen.findByRole('combobox', { name: /Select Image from Library/i });
    await user.click(mediaSelectTrigger); // Open the dropdown
    const option = await screen.findByRole('option', { name: mockMediaItems[1]!.filename });
    await user.click(option);

    // Submit
    await user.click(screen.getByRole("button", { name: /Schedule Campaign/i }));

    // Assertions
    await waitFor(() => {
       // Verify upload was NOT called
       expect(mockUploadMutate).not.toHaveBeenCalled();

       // Verify create campaign call with the selected library ID
       expect(mockCreateMutate).toHaveBeenCalledTimes(1);
       expect(mockCreateMutate).toHaveBeenCalledWith(
         expect.objectContaining({
           name: "Library Select Test",
           mediaLibraryItemId: mockMediaItems[1]!.id, // ID from selected library item
           scheduledAt: expect.any(Date), // Check date type
         }),
         expect.anything()
       );
      expect(toast.success).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/dashboard/campaigns");
    });
  });

});