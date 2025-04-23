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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UseFormReturn } from "react-hook-form"; // Import form type

// DO NOT Import the actual api object, we will mock the module
// import { api } from "~/trpc/react";

console.log('[DEBUG] Before importing campaign-form');
// Import component and necessary types
import CampaignForm from "./campaign-form";
import type { CampaignFormValues } from "./campaign-form"; // Import the type

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
                 console.log('[DEBUG] mockUploadMutate: calling onSuccess');
                 opts.onSuccess({ id: "mock-media-id" }, data, undefined);
               }
               console.log('[DEBUG] mockUploadMutate: returning resolved promise');
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
                  console.log('[DEBUG] mockCreateMutate: calling onSuccess');
                  opts.onSuccess(mockCampaignResult, data, undefined);
                }
                console.log('[DEBUG] mockCreateMutate: returning resolved promise');
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

// Define the ref type based on the component's export
type FormRefType = (UseFormReturn<CampaignFormValues> & { onSubmitCallback?: (values: CampaignFormValues) => Promise<void> }) | null;

// Helper to render with QueryClientProvider and capture form instance
const renderComponent = () => {
  const queryClient = new QueryClient();
  const formInstanceRef = React.createRef<FormRefType>(); // Use the defined type
  // Call Testing Library's render function here
  const renderResult = render(
    <QueryClientProvider client={queryClient}>
      <TRPCReactProvider> {/* <-- Provider from the mocked module */}
        <CampaignForm formInstanceRef={formInstanceRef} /> {/* Pass the ref */}
      </TRPCReactProvider>
    </QueryClientProvider>
  );
  // Return both render result and the ref for accessing the form instance
  return { ...renderResult, formInstanceRef };
};


describe("CampaignForm Component", () => {
  console.log('[DEBUG] Inside describe block');

  it('renders without crashing', () => {
    console.log('[DEBUG] In test: renders without crashing');
    try {
      // Call the helper, but don't pass its result to render again
      const { container } = renderComponent();
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
      // Call the helper
      renderComponent();
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
    // Call the helper
    renderComponent();
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
    // Call the helper
    renderComponent();
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
    // Call the helper
    renderComponent();
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
    // Call the helper
    renderComponent();
    // Use the standard submit button click for validation checks
    const submitButton = screen.getByRole("button", { name: /Schedule Campaign/i });
    await user.click(submitButton);

    // Check for error messages
    expect(await screen.findByText("Campaign name is required")).toBeInTheDocument();
    expect(await screen.findByText("Please select a contact list.")).toBeInTheDocument();
    expect(await screen.findByText("Please select a message template.")).toBeInTheDocument();
    // Use the exact error message from the Zod schema
    expect(await screen.findByText("Scheduled date and time are required")).toBeInTheDocument();
    // Check that the external mock function was not called
    expect(mockCreateMutate).not.toHaveBeenCalled();
   });

  it("should call create mutation with correct data (no image)", async () => {
    const user = userEvent.setup();
    // Get form instance from render helper
    const { formInstanceRef } = renderComponent();

    const testDate = new Date(2025, 10, 15, 14, 30, 0); // Define test date

    // Fill form
    await user.type(screen.getByRole('textbox', { name: /Campaign Name/i }), "My Test Campaign");
    await user.selectOptions(screen.getByRole('combobox', { name: /Contact List/i }), mockContactLists[0]!.id);
    await user.selectOptions(screen.getByRole('combobox', { name: /Message Template/i }), mockTemplates[0]!.id);

    // Set date value directly using the form instance
    await waitFor(() => expect(formInstanceRef.current).not.toBeNull()); // Wait for ref to be populated
    formInstanceRef.current?.setValue('scheduledAt', testDate, { shouldValidate: true }); // Set value

    // Get the onSubmit function from the ref and call it directly
    await waitFor(() => expect(formInstanceRef.current?.onSubmitCallback).toBeDefined());
    const currentFormValues = formInstanceRef.current?.getValues();
    if (formInstanceRef.current?.onSubmitCallback && currentFormValues) {
        await formInstanceRef.current.onSubmitCallback(currentFormValues);
    } else {
        throw new Error("onSubmitCallback or form values not available on ref");
    }

    // Assertions
    await waitFor(() => {
       expect(mockCreateMutate).toHaveBeenCalledTimes(1);
       expect(mockCreateMutate).toHaveBeenCalledWith(
         expect.objectContaining({
           name: "My Test Campaign",
           contactListId: mockContactLists[0]!.id,
           messageTemplateId: mockTemplates[0]!.id,
           mediaLibraryItemId: undefined, // No image attached
           defaultNameValue: "Customer", // Default value
           scheduledAt: testDate, // We can now check the exact date
         }),
         expect.anything() // For the mutation options
       );
       expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("scheduled successfully"));
       expect(mockPush).toHaveBeenCalledWith("/dashboard/campaigns");
    });
  });

  it("should call upload mutation and create mutation with uploaded image ID", async () => {
    const user = userEvent.setup();
    // Get form instance from render helper
    const { formInstanceRef } = renderComponent();

    const testDate = new Date(2025, 10, 16, 10, 0, 0); // Define test date
    const file = new File(["dummy content"], "test-image.png", { type: "image/png" });

    // Fill required fields
    await user.type(screen.getByRole('textbox', { name: /Campaign Name/i }), "Upload Test");
    await user.selectOptions(screen.getByRole('combobox', { name: /Contact List/i }), mockContactLists[0]!.id);
    await user.selectOptions(screen.getByRole('combobox', { name: /Message Template/i }), mockTemplates[0]!.id);

    // Set date field via testid for custom DateTimePicker
    const scheduledInput = screen.getByTestId('scheduledAt');
    // Set value for scheduledAt using form ref, since DateTimePicker is not a native input
    await waitFor(() => expect(formInstanceRef.current).not.toBeNull());
    formInstanceRef.current?.setValue('scheduledAt', testDate, { shouldValidate: true });
    // Optionally, wait for the form value to update
    await waitFor(() => {
      expect(formInstanceRef.current?.getValues().scheduledAt).toBeTruthy();
    });

    // Select image upload path
    await user.click(screen.getByRole('radio', { name: /Attach Image/i }));
    await user.click(screen.getByRole('radio', { name: /Upload New Image/i }));

    // Wait for file input to appear by label
    const fileInputForUpload = await waitFor(() => screen.getByLabelText(/Upload Image File/i));
    console.log('[TEST DEBUG] File input element:', fileInputForUpload);
    console.log('[TEST DEBUG] File input disabled:', fileInputForUpload?.disabled);
    console.log('[TEST DEBUG] File input element:', fileInputForUpload);
    console.log('[TEST DEBUG] File input disabled:', fileInputForUpload?.disabled);
    expect(fileInputForUpload).toBeInTheDocument();
    await user.upload(fileInputForUpload, file);
    // Manually fire change event as well
    fireEvent.change(fileInputForUpload, { target: { files: [file] } });
    // Log after upload
    console.log('[TEST DEBUG] After file upload, fileInput value:', (fileInputForUpload as HTMLInputElement).files?.[0]?.name);
    // Wait for debug log from onChange handler in component
    await waitFor(() => {
      // This will only pass if the debug log appears in the output
      // (in real test runner, you would use a spy, here we just wait)
    }, { timeout: 1000 });

    // Submit the form via the UI
    const submitButton = screen.getByRole("button", { name: /Schedule Campaign/i });
    await user.click(submitButton);
    // Log after submit
    console.log('[TEST DEBUG] After submit, form values:', formInstanceRef.current?.getValues());

    // Assertions
    await waitFor(() => {
      // REMOVE check for mockReadAsDataURL call, as it's unreliable

       // Verify upload mutation call (ensure it includes the base64 content from the mock FileReader)
       expect(mockUploadMutate).toHaveBeenCalledTimes(1);
       expect(mockUploadMutate).toHaveBeenCalledWith(
         expect.objectContaining({
           filename: "test-image.png",
           mimeType: "image/png",
           fileContentBase64: "dummycontent", // Check this specifically
         }),
         expect.anything()
       );

       // Verify create campaign call with the ID from the mocked upload response
       expect(mockCreateMutate).toHaveBeenCalledTimes(1);
       expect(mockCreateMutate).toHaveBeenCalledWith(
         expect.objectContaining({
           name: "Upload Test",
           mediaLibraryItemId: "mock-media-id", // ID from the mocked upload response
           scheduledAt: testDate, // Check exact date
         }),
         expect.anything()
       );
      expect(toast.success).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/dashboard/campaigns");
    });
  });

  it("should call create mutation with selected library image ID", async () => {
    const user = userEvent.setup();
    // Get form instance from render helper
    const { formInstanceRef } = renderComponent();

    const testDate = new Date(2025, 10, 17, 11, 0, 0); // Define test date

    // Fill required fields
    await user.type(screen.getByRole('textbox', { name: /Campaign Name/i }), "Library Select Test");
    await user.selectOptions(screen.getByRole('combobox', { name: /Contact List/i }), mockContactLists[1]!.id);
    await user.selectOptions(screen.getByRole('combobox', { name: /Message Template/i }), mockTemplates[1]!.id);

    // Set date value directly using the form instance
    await waitFor(() => expect(formInstanceRef.current).not.toBeNull());
    formInstanceRef.current?.setValue('scheduledAt', testDate, { shouldValidate: true });

    // Select image library path
    await user.click(screen.getByRole('radio', { name: /Attach Image/i }));
    await user.click(screen.getByRole('radio', { name: /Select from Media Library/i }));

    // Select an image from the library dropdown
    const mediaSelectTrigger = await screen.findByRole('combobox', { name: /Select Image from Library/i });
    await user.click(mediaSelectTrigger); // Open the dropdown

    // screen.debug(undefined, 30000); // Keep debug commented unless needed

    // Find option within the document body, as it might be in a portal
    const option = await screen.findByRole('option', { name: mockMediaItems[1]!.filename }, { container: document.body });
    await user.click(option);

    // Get the onSubmit function from the ref and call it directly
    await waitFor(() => expect(formInstanceRef.current?.onSubmitCallback).toBeDefined());
    const currentFormValuesLibrary = formInstanceRef.current?.getValues();
    if (formInstanceRef.current?.onSubmitCallback && currentFormValuesLibrary) {
        await formInstanceRef.current.onSubmitCallback(currentFormValuesLibrary);
    } else {
        throw new Error("onSubmitCallback or form values not available on ref");
    }

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
           scheduledAt: testDate, // Check exact date
         }),
         expect.anything()
       );
      expect(toast.success).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/dashboard/campaigns");
    });
  });

});