"use client";

console.log('[DEBUG] campaign-form.tsx loaded');
import React, { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import DateTimePicker from 'react-datetime-picker';
import 'react-datetime-picker/dist/DateTimePicker.css';
import 'react-calendar/dist/Calendar.css'; // Dependency for DateTimePicker styling
import 'react-clock/dist/Clock.css'; // Dependency for DateTimePicker styling

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils"; // Reverted back to alias path
import { api } from "~/trpc/react";
// No longer need full MediaLibraryItem type here
// import type { MediaLibraryItem } from "@prisma/client";

// Form schema - only includes fields submitted to the backend
const formSchema = z.object({
  name: z.string().min(1, "Campaign name cannot be empty"),
  contactListId: z.string().min(1, "Please select a contact list"),
  messageTemplateId: z.string().min(1, "Please select a message template"),
  defaultNameValue: z.string().min(1, "Default name value cannot be empty"),
  scheduledAt: z.date({ required_error: "Scheduled date and time are required" }),
  mediaLibraryItemId: z.string().optional(), // Will hold the ID if selected/uploaded
});

type CampaignFormValues = z.infer<typeof formSchema>;

export function CampaignForm() {
  console.log('[DEBUG] CampaignForm rendered');
  console.log('[DEBUG] CampaignForm rendered');
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // UI State managed separately from form values
  const [attachImageState, setAttachImageState] = useState<boolean>(false);
  const [imageSourceState, setImageSourceState] = useState<'upload' | 'library' | undefined>(undefined);

  // Fetch data for Selects
  const contactListsQuery = api.contactList.list.useQuery();
  const templatesQuery = api.template.list.useQuery();
  console.log('[DEBUG] contactListsQuery.data:', contactListsQuery.data);
  console.log('[DEBUG] templatesQuery.data:', templatesQuery.data);
  // Media library query will be fetched conditionally later if needed
  // Media library query will be fetched conditionally later if needed

  // tRPC Mutations
  const createCampaign = api.campaign.create.useMutation({
    onSuccess: (data) => {
      toast.success(`Campaign "${data.name}" scheduled successfully!`);
      router.push('/dashboard/campaigns'); // Redirect to campaigns list
      // Optionally reset form or invalidate queries if staying on page
    },
    onError: (error) => {
      toast.error(`Failed to schedule campaign: ${error.message}`);
    },
  });

  // Note: The backend upload expects base64. We'll handle conversion in onSubmit.
  const uploadMedia = api.mediaLibrary.upload.useMutation({
     onError: (error) => {
       // Set form error specifically for the upload field if it fails
       form.setError("mediaLibraryItemId", { type: "manual", message: `Image upload failed: ${error.message}` });
       toast.error(`Image upload failed: ${error.message}`);
     },
  });

  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      contactListId: "",
      messageTemplateId: "",
      defaultNameValue: "Customer", // Sensible default?
      scheduledAt: undefined,
      // attachImage: false, // Removed from default values
      // imageSource: undefined, // Removed from default values
      mediaLibraryItemId: undefined,
    },
  });

  // Combine loading states - use isPending for mutations
  const isSubmitting = form.formState.isSubmitting || createCampaign.isPending || uploadMedia.isPending;

  // Function to convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        // Result includes the mime type prefix (e.g., "data:image/png;base64,"), remove it
        const base64String = (reader.result as string).split(',')[1];
        if (base64String) {
          resolve(base64String);
        } else {
          reject(new Error("Failed to convert file to base64"));
        }
      };
      reader.onerror = (error) => reject(error);
    });
  };


  // Form submission handler - explicitly use the derived type
  async function onSubmit(values: CampaignFormValues) {
    // Read UI state directly, not from form 'values'
    let finalMediaItemId: string | undefined = values.mediaLibraryItemId;

    try {
      // 1. Handle image upload if 'upload' selected and a file is present
      if (attachImageState && imageSourceState === 'upload') { // Use state variables
        if (!selectedFile) {
          // Still associate error with mediaLibraryItemId for display purposes
          form.setError("mediaLibraryItemId", { type: "manual", message: "Please select an image file to upload." });
          return; // Stop submission if file is missing
        }

        // Convert file to base64
        let fileContentBase64: string;
        try {
          fileContentBase64 = await fileToBase64(selectedFile);
        } catch (error) {
           form.setError("mediaLibraryItemId", { type: "manual", message: "Failed to read file for upload." });
           console.error("File reading error:", error);
           return;
        }


        // Call upload mutation
        const uploadResult = await uploadMedia.mutateAsync({
          filename: selectedFile.name,
          fileContentBase64: fileContentBase64,
          mimeType: selectedFile.type,
        });

        // Check if upload was successful (backend returns { id: string })
        if (!uploadResult?.id) {
           // Error should have been caught by onError, but double-check
           form.setError("mediaLibraryItemId", { type: "manual", message: "Upload completed but failed to return an ID." });
           return;
        }
        finalMediaItemId = uploadResult.id; // Use the ID from the upload
      } else if (!attachImageState) { // Use state variable
         finalMediaItemId = undefined; // Ensure no media ID if not attaching image
      }
      // If imageSource is 'library', finalMediaItemId already holds the selection from the form values

      // 2. Prepare data for createCampaign mutation
      const campaignData = {
        name: values.name,
        contactListId: values.contactListId,
        messageTemplateId: values.messageTemplateId,
        defaultNameValue: values.defaultNameValue,
        scheduledAt: values.scheduledAt,
        mediaLibraryItemId: finalMediaItemId, // Use the potentially updated ID
      };

      // 3. Call createCampaign mutation
      await createCampaign.mutateAsync(campaignData);

    } catch (error) {
      // Errors from mutations are handled by their respective onError handlers (toast/setError)
      // We might catch other unexpected errors here if needed.
      console.error("Submission error:", error);
      // Optionally show a generic error toast if not handled by mutation onError
      // Use status instead of isError for mutations
      if (uploadMedia.status !== 'error' && createCampaign.status !== 'error') {
         toast.error("An unexpected error occurred during submission.");
      }
    }
  }

  console.log('[DEBUG] Rendering form fields', {
    contactListsQuery,
    templatesQuery,
    defaultValues: form.getValues(),
  });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* TODO: Add FormField components for each input */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <label htmlFor="campaign-name" className="block text-sm font-medium leading-6 text-gray-900">Campaign Name</label>
               <FormControl>
                 <Input id="campaign-name" placeholder="e.g., Summer Sale Promotion" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Contact List Select */}
        <FormField
          control={form.control}
          name="contactListId"
          render={({ field }) => (
            <FormItem>
              <label htmlFor="contact-list" className="block text-sm font-medium leading-6 text-gray-900">Contact List</label>
<FormControl>
  <select
    id="contact-list"
    name={field.name}
    value={field.value}
    onChange={field.onChange}
    disabled={contactListsQuery.isLoading}
    className="block w-full rounded-md border border-gray-300 py-2 px-3 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
  >
    <option value="">Select a contact list...</option>
    {contactListsQuery.isLoading && <option value="loading" disabled>Loading...</option>}
    {contactListsQuery.data?.map((list) => (
      <option key={list.id} value={list.id}>
        {list.name} ({list.contactCount} contacts)
      </option>
    ))}
    {contactListsQuery.isSuccess && contactListsQuery.data?.length === 0 && (
      <option value="no-lists" disabled>No contact lists found.</option>
    )}
  </select>
</FormControl>
              <FormDescription>
                The list of contacts to send this campaign to.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Message Template Select */}
        <FormField
          control={form.control}
          name="messageTemplateId"
          render={({ field }) => (
            <FormItem>
              <label htmlFor="message-template" className="block text-sm font-medium leading-6 text-gray-900">Message Template</label>
<FormControl>
  <select
    id="message-template"
    name={field.name}
    value={field.value}
    onChange={field.onChange}
    disabled={templatesQuery.isLoading}
    className="block w-full rounded-md border border-gray-300 py-2 px-3 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
  >
    <option value="">Select a message template...</option>
    {templatesQuery.isLoading && <option value="loading" disabled>Loading...</option>}
    {templatesQuery.data?.map((template) => (
      <option key={template.id} value={template.id}>
        {template.name}
      </option>
    ))}
    {templatesQuery.isSuccess && templatesQuery.data?.length === 0 && (
      <option value="no-templates" disabled>No templates found.</option>
    )}
  </select>
</FormControl>
              <FormDescription>
                The message content to send. Use <code>{`{Name}`}</code> for personalization.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Image Attachment Section - Managed by useState, not FormField */}
        <div className="space-y-3 rounded-md border p-4">
           <FormLabel htmlFor="attach-image">Attach Image? (Optional)</FormLabel>
           <RadioGroup
             onValueChange={(value: string) => {
               const shouldAttach = value === 'true';
               setAttachImageState(shouldAttach);
               // Reset dependent state if switching back to 'No Image'
               if (!shouldAttach) {
                 setImageSourceState(undefined);
                 setSelectedFile(null);
                 form.setValue("mediaLibraryItemId", undefined); // Clear potential selection
               }
             }}
             defaultValue={String(attachImageState)}
             className="flex flex-col space-y-1"
           >
             <FormItem className="flex items-center space-x-3 space-y-0">
               <FormControl>
                 <RadioGroupItem value="false" id="no-image" />
               </FormControl>
               <FormLabel className="font-normal" htmlFor="no-image">
                 No Image
               </FormLabel>
             </FormItem>
             <FormItem className="flex items-center space-x-3 space-y-0">
               <FormControl>
                 <RadioGroupItem value="true" id="attach-image" />
               </FormControl>
               <FormLabel className="font-normal" htmlFor="attach-image">
                 Attach Image
               </FormLabel>
             </FormItem>
           </RadioGroup>
           {/* No FormMessage needed here as it's not tied to schema validation */}
         </div>

        {/* Conditional Image Source Selection - Managed by useState */}
        {attachImageState && (
          <div className="space-y-3 rounded-md border p-4">
            <FormLabel htmlFor="image-source">Image Source</FormLabel>
            <RadioGroup
              onValueChange={(value: 'upload' | 'library') => {
                setImageSourceState(value);
                // Reset dependent fields when source changes
                form.setValue("mediaLibraryItemId", undefined);
                setSelectedFile(null);
              }}
              defaultValue={imageSourceState}
              className="flex flex-col space-y-1"
            >
              <FormItem className="flex items-center space-x-3 space-y-0">
                <FormControl>
                  <RadioGroupItem value="upload" id="upload-image" />
                </FormControl>
                <FormLabel className="font-normal" htmlFor="upload-image">
                  Upload New Image
                </FormLabel>
              </FormItem>
              <FormItem className="flex items-center space-x-3 space-y-0">
                <FormControl>
                  <RadioGroupItem value="library" id="select-from-library" />
                </FormControl>
                <FormLabel className="font-normal" htmlFor="select-from-library">
                  Select from Media Library
                </FormLabel>
              </FormItem>
            </RadioGroup>
            {/* No FormMessage needed here */}
          </div>
        )}

        {/* Conditional File Upload Input */}
        {attachImageState && imageSourceState === "upload" && ( // Use state variables
           <FormField
            control={form.control} // Keep control for error display on mediaLibraryItemId
            // react-hook-form doesn't directly control file inputs well.
            // We use the FormField mainly for layout and error message display.
            name="mediaLibraryItemId" // Use this field to display potential upload errors
            render={() => ( // field object isn't used directly here
              <FormItem>
                <FormLabel htmlFor="upload-image-file">Upload Image File</FormLabel>
                <FormControl>
                   <Input
                      type="file"
                      accept="image/jpeg, image/png, image/gif" // Specify acceptable image types
                      id="upload-image-file"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null; // Ensure null if undefined
                        setSelectedFile(file);
                        // Clear potential errors if user selects a file
                        if (file) form.clearErrors("mediaLibraryItemId");
                      }}
                    />
                </FormControl>
                 {selectedFile && <FormDescription>Selected: {selectedFile.name}</FormDescription>}
                {/* Display upload-specific errors here using form.formState.errors */}
                <FormMessage />
              </FormItem>
            )}
          />
        )}

         {/* Conditional Media Library Select */}
         {attachImageState && imageSourceState === "library" && ( // Use state variables
           <MediaLibrarySelect formControl={form.control} setValue={form.setValue} />
         )}


        {/* Default Name Value Input */}
        <FormField
          control={form.control}
          name="defaultNameValue"
          render={({ field }) => (
            <FormItem>
              <label htmlFor="default-name-value" className="block text-sm font-medium leading-6 text-gray-900">Default Name Value</label>
               <FormControl>
                 <Input id="default-name-value" placeholder="e.g., Friend, Valued Customer" {...field} />
              </FormControl>
              <FormDescription>
                This value will be used if a contact's name is missing when using the <code>{`{Name}`}</code> placeholder in the template.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Scheduled At Date/Time Picker */}
        <FormField
          control={form.control}
          name="scheduledAt"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Scheduled Time</FormLabel>
              <FormControl>
                {/* The DateTimePicker component might need custom styling to match shadcn */}
                <DateTimePicker
                  onChange={field.onChange}
                  value={field.value}
                  minDate={new Date()} // Prevent scheduling in the past
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm [&>div>input]:border-none [&>div>input]:bg-transparent [&>div>input]:outline-none [&>div>button]:text-foreground" // Basic styling attempt + override internal styles
                  // calendarClassName and clockClassName are not valid props for this component
                />
              </FormControl>
              <FormDescription>
                Select the date and time when the campaign should start sending messages.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />


        <Button type="submit" disabled={isSubmitting || contactListsQuery.isLoading || templatesQuery.isLoading}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSubmitting ? "Scheduling..." : "Schedule Campaign"}
        </Button>
      </form>
    </Form>
  );
}

// Define type for the data returned by mediaLibrary.list
type MediaListItem = {
  id: string;
  filename: string;
  createdAt: Date;
  mimeType: string;
};

// Helper component for Media Library Select to conditionally fetch data
// Pass control and setValue from the main form
// Use proper types from react-hook-form
import type { Control, UseFormSetValue } from "react-hook-form";

function MediaLibrarySelect({
  formControl,
  setValue,
}: {
  formControl: Control<CampaignFormValues>; // Use the specific form values type
  setValue: UseFormSetValue<CampaignFormValues>; // Use the specific form values type
}) {
  // We need to watch the imageSource field from the *parent* form instance
  // Directly calling useForm().watch() here creates a new instance and won't work.
  // This component needs access to the parent form's watch function or the value itself.
  // For now, we'll assume it's passed down or managed differently,
  // but the conditional fetching logic relies on knowing the imageSource.
  // Let's assume for now the enabled flag logic needs refinement based on how state is passed.

  // Conditionally fetch media library items
  // The 'enabled' flag should depend on the parent form's state.
  const mediaLibraryQuery = api.mediaLibrary.list.useQuery(undefined, {
     enabled: true, // Temporarily enable, fix with proper state later
     staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  return (
    <FormField
      control={formControl}
      name="mediaLibraryItemId" // This field will now hold the selected ID
      render={({ field }) => (
        <FormItem>
          <FormLabel>Select Image from Library</FormLabel>
          <Select
            // Use field.onChange provided by Controller
            onValueChange={(value: string) => { // Add type for value
              field.onChange(value);
              // Clear file input if user selects from library
              // Need access to setSelectedFile state setter from parent
              // setValue("selectedFile", null, { shouldValidate: false }); // This won't work directly
            }}
            value={field.value ?? ""} // Ensure value is controlled
            disabled={mediaLibraryQuery.isLoading || !mediaLibraryQuery.data}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Select an image..." />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {mediaLibraryQuery.isLoading && <SelectItem value="loading" disabled>Loading...</SelectItem>}
              {mediaLibraryQuery.data?.map((item: MediaListItem) => ( // Use specific MediaListItem type
                <SelectItem key={item.id} value={item.id}>
                  {item.filename} ({item.mimeType}) {/* Optionally show mimeType */}
                </SelectItem>
              ))}
              {mediaLibraryQuery.isSuccess && mediaLibraryQuery.data?.length === 0 && (
                 <SelectItem value="no-items" disabled>No media items found.</SelectItem>
              )}
               {mediaLibraryQuery.isError && (
                 <SelectItem value="error" disabled>Error loading media.</SelectItem>
              )}
            </SelectContent>
          </Select>
          <FormDescription>
            Choose an image previously uploaded to your media library.
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}