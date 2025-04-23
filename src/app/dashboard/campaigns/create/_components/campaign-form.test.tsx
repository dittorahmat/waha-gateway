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

import { describe, it, expect, vi, beforeEach } from "vitest"; // Keep only one vi import
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

console.log('[DEBUG] Before importing campaign-form');
import { CampaignForm } from "./campaign-form";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TRPCReactProvider } from "src/trpc/react";

// Mock tRPC API hooks to prevent real network calls in tests
// Removed duplicate import of vi

// --- Define Mocks & Mock Data BEFORE vi.mock ---
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


console.log('[DEBUG] Before vi.doMock');
// Mock the specific hooks we need from tRPC using vi.doMock to avoid hoisting issues
vi.doMock("src/trpc/react", () => {
  console.log('[DEBUG] tRPC mock used');
  return {
    // Keep TRPCReactProvider if it's used directly, otherwise omit
    TRPCReactProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    api: {
    contactList: {
        list: {
          useQuery: vi.fn().mockReturnValue({
             data: mockContactLists, // Use defined mock data
             isLoading: false,
             isError: false,
             error: null,
           }),
        },
      },
      template: {
        list: {
          useQuery: vi.fn().mockReturnValue({
             data: mockTemplates, // Use defined mock data
             isLoading: false,
             isError: false,
             error: null,
           }),
        },
      },
      campaign: {
        create: {
          useMutation: vi.fn().mockImplementation((opts?) => {
            // Use the external mock function here
            mockCreateMutate.mockImplementation((data, options) => {
              if (opts?.onSuccess) {
                // Simulate success callback with mock data
                opts.onSuccess({ id: "mock-campaign-id", name: data.name ?? "Mock Campaign" }, data, undefined);
              }
              // Return a resolved promise for mutateAsync behavior if needed by the component
              return Promise.resolve({ id: "mock-campaign-id", name: data.name ?? "Mock Campaign" });
            });
            return {
              mutate: mockCreateMutate, // Assign the external mock
              mutateAsync: mockCreateMutate, // Assign the external mock also for async calls
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
            data: { id: "mock-campaign-id", name: "Mock Campaign" },
            reset: vi.fn(),
            };
          }),
        },
        uploadMedia: {
          useMutation: vi.fn().mockImplementation((opts?) => ({
             mutate: (...args: any[]) => { // Add type for args
               if (opts && opts.onSuccess) {
                 // Pass only the expected success data type
                 opts.onSuccess({ id: "mock-media-id" }); // Assuming success returns { id: string }
              }
            },
            mutateAsync: vi.fn().mockResolvedValue({ id: "mock-media-id", url: "mock-url" }),
            isLoading: false,
            isSuccess: true,
            isError: false,
            error: null,
            data: { id: "mock-media-id", url: "mock-url" },
            reset: vi.fn(),
          })),
        },
       },
       mediaLibrary: { // Define mediaLibrary key only ONCE
         list: { // Add list query mock
           useQuery: vi.fn().mockReturnValue({
             data: mockMediaItems,
             isLoading: false,
             isError: false,
             error: null,
           }),
         },
         upload: { // Keep the upload mutation mock
           useMutation: vi.fn().mockImplementation((opts?) => {
             mockUploadMutate.mockImplementation((data, options) => {
                if (opts?.onSuccess) {
                  opts.onSuccess({ id: "mock-media-id", url: "mock-url" }, data, undefined);
                }
             });
             return {
               mutate: mockUploadMutate,
               mutateAsync: vi.fn().mockResolvedValue({ id: "mock-media-id", url: "mock-url" }),
               isLoading: false,
               isSuccess: true,
               isError: false,
               error: null,
               data: { id: "mock-media-id", url: "mock-url" },
               reset: vi.fn(),
             };
           }),
         },
       }, 
     }, 
   }
})
console.log('[DEBUG] After vi.doMock');
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

// Mock tRPC api calls (These might be redundant now if the vi.mock covers them)
// const mockCreateCampaign = vi.fn(); // Can likely be removed
// const mockUploadMedia = vi.fn(); // Can likely be removed
// mockContactLists, mockTemplates, mockMediaItems defined above the vi.mock

// Mock FileReader (basic)
// Note: Testing actual file reading/base64 conversion can be complex in JSDOM.
// This mock focuses on the interaction flow.
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
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCReactProvider>
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
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    // Reset mock implementations for mutations to default success
    // Reset the actual mocked hooks if needed, but the mock definition should handle this
    // vi.mocked(api.campaign.create.useMutation).mockClear(); // Example if needed
    // vi.mocked(api.mediaLibrary.upload.useMutation).mockClear(); // Example if needed
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

  it("should render all initial form fields", () => {
    try {
      renderComponent();
      screen.debug(); // DEBUG: Output the rendered DOM to help diagnose missing fields
    } catch (err) {
      console.error('[DEBUG] Error during renderComponent:', err);
      throw err;
    }
    expect(screen.getByLabelText(/Campaign Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Contact List/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Message Template/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Attach Image to Message?/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Default Name Value/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Schedule Date & Time/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Schedule Campaign/i })).toBeInTheDocument();
    // Image options should be hidden initially
    expect(screen.queryByLabelText(/Image Source/i)).not.toBeInTheDocument();
  });

  it("should show image source options when 'Attach Image' is checked", async () => {
    const user = userEvent.setup();
    renderComponent();
    const attachCheckbox = screen.getByLabelText(/Attach Image to Message?/i);

    await user.click(attachCheckbox);

    expect(screen.getByLabelText(/Image Source/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Upload New Image/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Select from Media Library/i)).toBeInTheDocument();
  });

  it("should show file input when 'Upload New Image' is selected", async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(screen.getByLabelText(/Attach Image to Message?/i));
    await user.click(screen.getByLabelText(/Upload New Image/i));

    expect(screen.getByLabelText(/Upload New Image/i)).toBeChecked();
    expect(screen.getByLabelText(/Select from Media Library/i)).not.toBeChecked();
    // expect(screen.getByRole('textbox', { name: '' })).toBeInTheDocument(); // Removed this unreliable check
    // More robust check might involve finding by specific attribute if label isn't direct
    expect(document.querySelector('input[type="file"]')).toBeInTheDocument(); // Rely on querySelector for file input presence
  });

  it("should show 'Select Image' button when 'Select from Media Library' is selected", async () => {
    const user = userEvent.setup();
    renderComponent();
    await user.click(screen.getByLabelText(/Attach Image to Message?/i));
    await user.click(screen.getByLabelText(/Select from Media Library/i));

    expect(screen.getByLabelText(/Upload New Image/i)).not.toBeChecked();
    expect(screen.getByLabelText(/Select from Media Library/i)).toBeChecked();
    expect(screen.getByRole("button", { name: /Select Image from Library/i })).toBeInTheDocument();
  });

  it("should require name, contact list, template, and schedule date on submit", async () => {
    const user = userEvent.setup();
    renderComponent();
    const submitButton = screen.getByRole("button", { name: /Schedule Campaign/i });

    await user.click(submitButton);

    // Check for error messages
    expect(await screen.findByText("Campaign name is required")).toBeInTheDocument();
    expect(await screen.findByText("Please select a contact list.")).toBeInTheDocument();
    expect(await screen.findByText("Please select a message template.")).toBeInTheDocument();
    expect(await screen.findByText("A schedule date is required.")).toBeInTheDocument();
    // Check that the external mock function was not called
    expect(mockCreateMutate).not.toHaveBeenCalled();
   });

  it("should call create mutation with correct data (no image)", async () => {
    const user = userEvent.setup();
    renderComponent();

    const testDate = new Date(2025, 10, 15, 14, 30, 0); // Fixed date for predictability

    await user.type(screen.getByLabelText(/Campaign Name/i), "My Test Campaign");
    // Select Contact List
    // Simulate selecting Contact List via hidden select
    const contactListSelect = screen.getByLabelText(/Contact List/i).closest('div[data-slot="form-item"]')?.querySelector('select[aria-hidden="true"]') as HTMLSelectElement;
    expect(contactListSelect).toBeInTheDocument(); // Verify hidden select found
    fireEvent.change(contactListSelect, { target: { value: mockContactLists[0]!.id } });

    // Simulate selecting Template via hidden select
    const templateSelect = screen.getByLabelText(/Message Template/i).closest('div[data-slot="form-item"]')?.querySelector('select[aria-hidden="true"]') as HTMLSelectElement;
    expect(templateSelect).toBeInTheDocument(); // Verify hidden select found
    fireEvent.change(templateSelect, { target: { value: mockTemplates[0]!.id } });
    // Select Date/Time using fireEvent.change with the correct label
    // Note: DateTimePicker might render multiple inputs; targeting the main associated input via label.
    // Find the container for the DateTimePicker using the label, then find the input within it
    const dateTimePickerContainer = screen.getByLabelText(/Scheduled Time/i).closest('.react-datetime-picker'); // Find the closest container div
    expect(dateTimePickerContainer).toBeInTheDocument();
    const dateTimeInput = dateTimePickerContainer?.querySelector('input[name="datetime"]'); // Find input within container (adjust selector if needed)
    expect(dateTimeInput).toBeInTheDocument();
    fireEvent.change(dateTimeInput!, { target: { value: testDate.toISOString() } }); // Use ISO string for input value

    await user.click(screen.getByRole("button", { name: /Schedule Campaign/i }));

    await waitFor(() => {
       expect(mockCreateMutate).toHaveBeenCalledTimes(1);
       expect(mockCreateMutate).toHaveBeenCalledWith(
         expect.objectContaining({
           name: "My Test Campaign",
          contactListId: mockContactLists[0]!.id, // Added non-null assertion
          messageTemplateId: mockTemplates[0]!.id, // Added non-null assertion
          mediaLibraryItemId: undefined, // No image attached
          defaultNameValue: "Customer", // Default value
          scheduledAt: expect.any(Date), // Check type, exact time depends on calendar interaction mock
        }),
        expect.anything() // For the mutation options
      );
       // Check if the date part matches
       const submittedCallArgs = mockCreateMutate.mock.calls[0]?.[0];
       expect(submittedCallArgs).toBeDefined(); // Ensure the call happened
       const submittedDate = submittedCallArgs!.scheduledAt; // Added non-null assertion after check
      expect(format(submittedDate, 'yyyy-MM-dd HH:mm')).toBe('2025-11-15 14:30');
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("scheduled successfully"));
      expect(mockPush).toHaveBeenCalledWith("/dashboard/campaigns");
    });
  });

  it("should call upload mutation and create mutation with uploaded image ID", async () => {
    const user = userEvent.setup();
    renderComponent();

    // Mock file selection
    const file = new File(["dummy content"], "test-image.png", { type: "image/png" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement; // Re-query after render

    // Fill required fields
    await user.type(screen.getByLabelText(/Campaign Name/i), "Upload Test");
    // Simulate selecting Contact List via hidden select
    const contactListSelect = screen.getByLabelText(/Contact List/i).closest('div[data-slot="form-item"]')?.querySelector('select[aria-hidden="true"]') as HTMLSelectElement;
    expect(contactListSelect).toBeInTheDocument();
    fireEvent.change(contactListSelect, { target: { value: mockContactLists[0]!.id } });

    // Simulate selecting Template via hidden select
    const templateSelect = screen.getByLabelText(/Message Template/i).closest('div[data-slot="form-item"]')?.querySelector('select[aria-hidden="true"]') as HTMLSelectElement;
    expect(templateSelect).toBeInTheDocument();
    fireEvent.change(templateSelect, { target: { value: mockTemplates[0]!.id } });
    // Select Date/Time using fireEvent.change with the correct label - updated selector
    const dateTimePickerContainerUpload = screen.getByLabelText(/Scheduled Time/i).closest('.react-datetime-picker');
    expect(dateTimePickerContainerUpload).toBeInTheDocument();
    const dateTimeInputUpload = dateTimePickerContainerUpload?.querySelector('input[name="datetime"]');
    expect(dateTimeInputUpload).toBeInTheDocument();
    fireEvent.change(dateTimeInputUpload!, { target: { value: new Date(2025, 10, 16, 10, 0, 0).toISOString() } });

    // Select image upload path
    await user.click(screen.getByLabelText(/Attach Image/i)); // Checkbox/Radio for attaching
    await user.click(screen.getByLabelText(/Upload New Image/i)); // Radio for upload source

    // Upload the file
    expect(fileInput).toBeInTheDocument(); // Ensure file input is visible
    await user.upload(fileInput, file);

    // Submit
    await user.click(screen.getByRole("button", { name: /Schedule Campaign/i }));

    // Assertions
    await waitFor(() => {
      // Verify FileReader was used (basic check)
      expect(mockReadAsDataURL).toHaveBeenCalledWith(file);

       // Verify upload mutation call (using the external mock)
       expect(mockUploadMutate).toHaveBeenCalledTimes(1);
       expect(mockUploadMutate).toHaveBeenCalledWith(
         expect.objectContaining({
           filename: "test-image.png",
          mimeType: "image/png",
          fileContentBase64: "dummycontent", // From mock FileReader result
        }),
        expect.anything()
      );

       // Verify create campaign call with the ID from the mocked upload response
       expect(mockCreateMutate).toHaveBeenCalledTimes(1);
       expect(mockCreateMutate).toHaveBeenCalledWith(
         expect.objectContaining({
           name: "Upload Test",
           mediaLibraryItemId: "mock-media-id", // ID from the mocked upload response
        }),
        expect.anything()
      );
      expect(toast.success).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/dashboard/campaigns");
    });
  });

  it("should call create mutation with selected library image ID", async () => {
    const user = userEvent.setup();
    renderComponent();

    // Fill required fields
    await user.type(screen.getByLabelText(/Campaign Name/i), "Library Select Test");
     // Simulate selecting Contact List via hidden select
    const contactListSelect = screen.getByLabelText(/Contact List/i).closest('div[data-slot="form-item"]')?.querySelector('select[aria-hidden="true"]') as HTMLSelectElement;
    expect(contactListSelect).toBeInTheDocument();
    fireEvent.change(contactListSelect, { target: { value: mockContactLists[1]!.id } }); // Use List Two ID

    // Simulate selecting Template via hidden select
    const templateSelect = screen.getByLabelText(/Message Template/i).closest('div[data-slot="form-item"]')?.querySelector('select[aria-hidden="true"]') as HTMLSelectElement;
    expect(templateSelect).toBeInTheDocument();
    fireEvent.change(templateSelect, { target: { value: mockTemplates[1]!.id } }); // Use Template Beta ID
     // Select Date/Time using fireEvent.change with the correct label - updated selector
    const dateTimePickerContainerLib = screen.getByLabelText(/Scheduled Time/i).closest('.react-datetime-picker');
    expect(dateTimePickerContainerLib).toBeInTheDocument();
    const dateTimeInputLib = dateTimePickerContainerLib?.querySelector('input[name="datetime"]');
    expect(dateTimeInputLib).toBeInTheDocument();
    fireEvent.change(dateTimeInputLib!, { target: { value: new Date(2025, 10, 17, 11, 0, 0).toISOString() } });


    // Select image library path
    await user.click(screen.getByLabelText(/Attach Image/i));
    await user.click(screen.getByLabelText(/Select from Media Library/i));

    // Select an image from the library dropdown
    // Simulate selecting Media Library Image via hidden select (assuming similar structure)
    // Note: The label is "Select Image from Library" but the underlying field name is mediaLibraryItemId
    // We might need to adjust the selector if the hidden select isn't directly associated with this label.
    // Let's try finding it within the FormItem rendered by MediaLibrarySelect component.
    // This might be brittle if the structure changes.
    const mediaSelectContainer = screen.getByLabelText(/Select Image from Library/i).closest('div[data-slot="form-item"]');
    expect(mediaSelectContainer).toBeInTheDocument();
    const mediaSelect = mediaSelectContainer?.querySelector('select[aria-hidden="true"]') as HTMLSelectElement;
    expect(mediaSelect).toBeInTheDocument(); // Verify hidden select found
    fireEvent.change(mediaSelect, { target: { value: mockMediaItems[1]!.id } }); // Use second media item ID

    // Submit
    await user.click(screen.getByRole("button", { name: /Schedule Campaign/i }));

    // Assertions
    await waitFor(() => {
       // Verify upload was NOT called (using the external mock)
       expect(mockUploadMutate).not.toHaveBeenCalled();

       // Verify create campaign call with the selected library ID
       expect(mockCreateMutate).toHaveBeenCalledTimes(1);
       expect(mockCreateMutate).toHaveBeenCalledWith(
         expect.objectContaining({
           name: "Library Select Test",
          mediaLibraryItemId: mockMediaItems[1]!.id, // ID from selected library item
        }),
        expect.anything()
      );
      expect(toast.success).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/dashboard/campaigns");
    });
  });

  // TODO: Add tests for error handling from mutations

});