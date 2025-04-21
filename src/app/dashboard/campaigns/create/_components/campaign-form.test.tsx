// @vitest-environment jsdom
// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react"; // screen, fireEvent, waitFor should be global now
import userEvent from "@testing-library/user-event";
import { CampaignForm } from "./campaign-form";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

// Mock tRPC api calls
const mockCreateCampaign = vi.fn();
const mockUploadMedia = vi.fn();
const mockContactLists = [
  { id: "list-1", name: "List One", contactCount: 10 },
  { id: "list-2", name: "List Two", contactCount: 25 },
];
const mockTemplates = [
  { id: "tmpl-1", name: "Template Alpha" },
  { id: "tmpl-2", name: "Template Beta" },
];
const mockMediaItems = [
  { id: "media-1", filename: "image1.jpg", createdAt: new Date(), mimeType: "image/jpeg" },
  { id: "media-2", filename: "image2.png", createdAt: new Date(), mimeType: "image/png" },
];

vi.mock("@/trpc/react", () => ({
  api: {
    contactList: {
      list: {
        useQuery: vi.fn(() => ({
          data: mockContactLists,
          isLoading: false,
          isError: false,
        })),
      },
    },
    template: {
      list: {
        useQuery: vi.fn(() => ({
          data: mockTemplates,
          isLoading: false,
          isError: false,
        })),
      },
    },
    mediaLibrary: {
      list: {
        useQuery: vi.fn(() => ({
          data: mockMediaItems,
          isLoading: false,
          isError: false,
        })),
      },
      upload: {
        useMutation: vi.fn(() => ({
          mutate: mockUploadMedia,
          isPending: false,
        })),
      },
    },
    campaign: {
      create: {
        useMutation: vi.fn(() => ({
          mutate: mockCreateCampaign,
          isPending: false,
        })),
      },
    },
  },
}));

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
  return render(
    <QueryClientProvider client={queryClient}>
      <CampaignForm />
    </QueryClientProvider>
  );
};

describe("CampaignForm Component", () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    // Reset mock implementations for mutations to default success
    mockCreateCampaign.mockImplementation((_data, options) => {
      options?.onSuccess?.({ id: "new-camp-1", name: "Test Campaign" });
    });
    mockUploadMedia.mockImplementation((_data, options) => {
       options?.onSuccess?.({ id: "new-media-1" });
    });
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
    renderComponent();
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
    expect(mockCreateCampaign).not.toHaveBeenCalled();
  });

  it("should call create mutation with correct data (no image)", async () => {
    const user = userEvent.setup();
    renderComponent();

    const testDate = new Date(2025, 10, 15, 14, 30, 0); // Fixed date for predictability

    await user.type(screen.getByLabelText(/Campaign Name/i), "My Test Campaign");
    // Select Contact List
    await user.click(screen.getByRole("combobox", { name: /Contact List/i }));
    await user.click(await screen.findByText(/List One/)); // Select by text
    // Select Template
    await user.click(screen.getByRole("combobox", { name: /Message Template/i }));
    await user.click(await screen.findByText(/Template Alpha/));
    // Select Date/Time
    await user.click(screen.getByText("Pick date and time")); // Use getByText for the button content
    await user.click(await screen.findByText("15")); // Click day 15 in the calendar
    // Find the time input and set value (more direct way for testing)
    const timeInput = screen.getByLabelText('Time');
    fireEvent.change(timeInput, { target: { value: '14:30' } });

    await user.click(screen.getByRole("button", { name: /Schedule Campaign/i }));

    await waitFor(() => {
      expect(mockCreateCampaign).toHaveBeenCalledTimes(1);
      expect(mockCreateCampaign).toHaveBeenCalledWith(
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
      const submittedCallArgs = mockCreateCampaign.mock.calls[0]?.[0];
      expect(submittedCallArgs).toBeDefined(); // Ensure the call happened
      const submittedDate = submittedCallArgs!.scheduledAt; // Added non-null assertion after check
      expect(format(submittedDate, 'yyyy-MM-dd HH:mm')).toBe('2025-11-15 14:30');
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("scheduled successfully"));
      expect(mockPush).toHaveBeenCalledWith("/dashboard/campaigns");
    });
  });

  // TODO: Add tests for image upload flow
  // TODO: Add tests for image library selection flow
  // TODO: Add tests for form submission with image attached
  // TODO: Add tests for error handling from mutations

});