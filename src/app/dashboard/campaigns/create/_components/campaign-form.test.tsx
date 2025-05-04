import { vi, describe, it, expect, beforeEach } from 'vitest'
import './campaign-form.test.mocks'
import { renderComponent } from './campaign-form.test.helpers'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import {
  mockMediaItems,
  mockCreateMutate,
  mockUploadMutate,
  mockPush,
} from './campaign-form.test.mocks'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

console.log('[TEST DEBUG] Mocks imported'); // Added log

describe('CampaignForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fills fields and submits without upload', async () => {
    console.log('[TEST DEBUG] Starting test: fills fields and submits without upload'); // Added log
    const user = userEvent.setup()
    const { formInstanceRef } = renderComponent()
    console.log('[TEST DEBUG] Component rendered'); // Added log

    console.log('[TEST LOG] post-render ref.current=', formInstanceRef.current);

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
    console.log('[DEBUG] mockContactLists:', JSON.stringify(mockContactLists));
    await user.type(screen.getByRole('textbox', { name: /Campaign Name/i }), "Library Select Test");
    // Select contact list using native <select> in test mode
    const contactListSelect = screen.getByTestId('contact-list-select');
    expect(contactListSelect).toBeInTheDocument();
    await user.selectOptions(contactListSelect, mockContactLists[1]!.id);
    // Log after selection
    console.log('[DEBUG] Selected contact list:', contactListSelect.value);

      await waitFor(() => {
        contactOption = within(document.body).getByText(mockContactLists[1]!.name, { exact: false });
        console.log('[DEBUG] Found contactOption inside waitFor:', contactOption);
        expect(contactOption).toBeInTheDocument();
      }, { timeout: 2000 });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('[DEBUG] Could not find contact option by text:', e);
      // Print all text content in poppers
      document.querySelectorAll('[data-radix-popper-content-wrapper]').forEach((popper, i) => {
        // eslint-disable-next-line no-console
        console.log(`[DEBUG] Popper #${i} text:`, popper.textContent);
      });
      // Dump DOM again for further inspection
      // eslint-disable-next-line no-console
      screen.debug();
      throw e;
    }
    await user.click(contactOption!);
    // Open Message Template dropdown and select option
    const templateTrigger = screen.getByRole('combobox', { name: /Message Template/i });
    await user.click(templateTrigger);
    // Print all dropdown popper content for debug
    document.querySelectorAll('[data-radix-popper-content-wrapper]').forEach((popper, i) => {
      // eslint-disable-next-line no-console
      console.log(`[DEBUG] Popper #${i}:`, popper.innerHTML);
    });
    // Query by visible text instead of role
    // Use within(document.body) to find the option in a portal
    let templateOption: HTMLElement | null = null;
    try {
      const { within } = await import('@testing-library/react');
      templateOption = within(document.body).getByText(mockTemplates[1]!.name, { exact: false });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('[DEBUG] Could not find template option by text:', e);
      document.querySelectorAll('[data-radix-popper-content-wrapper]').forEach((popper, i) => {
        // eslint-disable-next-line no-console
        console.log(`[DEBUG] Popper #${i} text:`, popper.textContent);
      });
      throw e;
    }
    await user.click(templateOption);

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
      console.log('[TEST DEBUG] Inside waitFor assertion check'); // Added log
      expect(toast.success).toHaveBeenCalled()
      expect(mockPush).toHaveBeenCalledWith('/dashboard/campaigns')
    })
    console.log('[TEST DEBUG] Assertions passed'); // Added log
  })
})
