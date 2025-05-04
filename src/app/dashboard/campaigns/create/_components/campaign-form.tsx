"use client";

import React, { useState, useEffect, useCallback } from "react"; 
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form"; 
import { z } from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import DateTimePicker from 'react-datetime-picker';
import 'react-datetime-picker/dist/DateTimePicker.css';
import 'react-calendar/dist/Calendar.css';
import 'react-clock/dist/Clock.css';

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
import { cn } from "@/lib/utils";
import { api } from "~/trpc/react";
import type { Control, UseFormSetValue } from "react-hook-form";

// Form schema
const formSchema = z.object({
  name: z.string().min(1, "Campaign name cannot be empty"),
  contactListId: z.string().min(1, "Please select a contact list"),
  messageTemplateId: z.string().min(1, "Please select a message template"),
  defaultNameValue: z.string().min(1, "Default name value cannot be empty"),
  scheduledAt: z.date({ required_error: "Scheduled date and time are required" }),
  mediaLibraryItemId: z.string().optional(),
});

export type CampaignFormValues = z.infer<typeof formSchema>;

// Define the type for the ref content, including the onSubmit callback and null
type FormRefType = (Partial<UseFormReturn<CampaignFormValues>> & {
  submitCallback?: (values: CampaignFormValues) => Promise<void>;
}) | null;

// Add prop type for the optional ref
interface CampaignFormProps {
  formInstanceRef?: React.MutableRefObject<FormRefType>;
}

export default function CampaignForm({ formInstanceRef }: CampaignFormProps = {}) {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [attachImageState, setAttachImageState] = useState<boolean>(false);
  const [imageSourceState, setImageSourceState] = useState<"upload" | "library" | null>(null);

  const contactListsQuery = api.contactList.list.useQuery();
  const templatesQuery = api.template.list.useQuery();
  const utils = api.useUtils(); 

  const createMutation = api.campaign.create.useMutation({
    onSuccess: (data) => {
      toast.success(`Campaign "${data.name}" scheduled successfully!`);
      router.push('/dashboard/campaigns');
    },
    onError: (error) => {
      toast.error(`Failed to schedule campaign: ${error.message}`);
    },
  });

  const createCampaign = api.campaign.create.useMutation({
    onSuccess: (data) => {
      toast.success(`Campaign "${data.name}" scheduled successfully!`);
      router.push('/dashboard/campaigns');
    },
    onError: (error) => {
      toast.error(`Failed to schedule campaign: ${error.message}`);
    },
  });

  const uploadMedia = api.mediaLibrary.upload.useMutation({
    onSuccess: (data) => { 
      toast.success(`Image uploaded successfully! (ID: ${data.id})`); 
      void utils.mediaLibrary.list.invalidate(); 
    },
    onError: (error) => {
      form.setError("mediaLibraryItemId", { type: "manual", message: `Image upload failed: ${error.message}` });
      toast.error(`Image upload failed: ${error.message}`);
    },
  });

  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "", contactListId: "", messageTemplateId: "",
      defaultNameValue: "Customer", scheduledAt: new Date(), mediaLibraryItemId: undefined,
    },
  });

  const watched = form.watch();

  React.useEffect(() => {
    if (formInstanceRef) {
      formInstanceRef.current = form;
    }
  }, [formInstanceRef, form]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        if (base64String) resolve(base64String);
        else reject(new Error("Failed to convert file to base64"));
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const onSubmit = useCallback(async (values: CampaignFormValues) => {
    let finalMediaItemId: string | undefined = values.mediaLibraryItemId;

    try {
      if (attachImageState && imageSourceState === 'upload') {
        if (!selectedFile) {
          form.setError("mediaLibraryItemId", { type: "manual", message: "Please select an image file to upload." });
          return;
        }
        let fileContentBase64: string;
        try {
          fileContentBase64 = await fileToBase64(selectedFile);
        } catch (error) {
          form.setError("mediaLibraryItemId", { type: "manual", message: "Failed to read file for upload." });
          return;
        }
        const uploadResult = await uploadMedia.mutateAsync({
          filename: selectedFile.name, fileContentBase64, mimeType: selectedFile.type,
        });
        if (!uploadResult?.id) {
          form.setError("mediaLibraryItemId", { type: "manual", message: "Upload completed but failed to return an ID." });
          return;
        }
        finalMediaItemId = uploadResult.id;
      } else if (!attachImageState) {
        finalMediaItemId = undefined;
      }

      const campaignData = { ...values, mediaLibraryItemId: finalMediaItemId };
      await createCampaign.mutateAsync(campaignData, {});

    } catch (error) {
      if (uploadMedia.status !== 'error' && createCampaign.status !== 'error') {
        toast.error("An unexpected error occurred during submission.");
      }
    }
  }, [
    attachImageState, imageSourceState, selectedFile, form, 
    uploadMedia, createCampaign, 
  ]); 

  const onFormInvalid = (errors: FieldErrors<CampaignFormValues>) => {
    toast.error("Please correct the errors in the form.");
  };

  useEffect(() => {
    if (formInstanceRef) {
      formInstanceRef.current = form; 
      formInstanceRef.current.submitCallback = onSubmit; 
    }
    return () => {
      if (formInstanceRef) {
        formInstanceRef.current = null;
      }
    };
  }, [form, formInstanceRef, onSubmit]);

  const isSubmitting = form.formState.isSubmitting || createCampaign.isPending || uploadMedia.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, onFormInvalid)} className="space-y-8">
        {/* Campaign Name */}
        <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem>
              <FormLabel>Campaign Name</FormLabel> 
              <FormControl><Input placeholder="e.g., Summer Sale Promotion" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
        )} />

        {/* Contact List Select */}
         <FormField control={form.control} name="contactListId" render={({ field }) => (
            <FormItem>
              <FormLabel>Contact List</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value ?? ""} disabled={contactListsQuery.isLoading}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a contact list..." />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {contactListsQuery.isLoading && <SelectItem value="loading" disabled>Loading...</SelectItem>}
                  {contactListsQuery.data?.map((list) => (
                    <SelectItem key={list.id} value={list.id}>{list.name} ({list.contactCount} contacts)</SelectItem>
                  ))}
                  {contactListsQuery.isSuccess && contactListsQuery.data?.length === 0 && (
                    <SelectItem value="no-lists" disabled>No contact lists found.</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <FormDescription>The list of contacts to send this campaign to.</FormDescription>
              <FormMessage />
            </FormItem>
         )} />

        {/* Message Template Select */}
        <FormField control={form.control} name="messageTemplateId" render={({ field }) => (
            <FormItem>
              <FormLabel>Message Template</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value ?? ""} disabled={templatesQuery.isLoading}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a message template..." />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {templatesQuery.isLoading && <SelectItem value="loading" disabled>Loading...</SelectItem>}
                  {templatesQuery.data?.map((template) => (
                    <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                  ))}
                  {templatesQuery.isSuccess && templatesQuery.data?.length === 0 && (
                    <SelectItem value="no-templates" disabled>No templates found.</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <FormDescription>The message content to send. Use <code>{`{Name}`}</code> for personalization.</FormDescription>
              <FormMessage />
            </FormItem>
        )} />

        {/* Image Attachment Section */}
        <div className="space-y-3 rounded-md border p-4">
           <FormLabel htmlFor="attach-image">Attach Image? (Optional)</FormLabel>
           <RadioGroup onValueChange={(value: string) => { const shouldAttach = value === 'true'; setAttachImageState(shouldAttach); if (!shouldAttach) { setImageSourceState(undefined); setSelectedFile(null); form.setValue("mediaLibraryItemId", undefined); } }} defaultValue={String(attachImageState)} className="flex flex-col space-y-1">
             <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="false" id="no-image" /></FormControl><FormLabel className="font-normal" htmlFor="no-image">No Image</FormLabel></FormItem>
             <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="true" id="attach-image" /></FormControl><FormLabel className="font-normal" htmlFor="attach-image">Attach Image</FormLabel></FormItem>
           </RadioGroup>
         </div>

        {/* Conditional Image Source Selection */}
        {attachImageState && (
          <div className="space-y-3 rounded-md border p-4">
            <FormLabel htmlFor="image-source">Image Source</FormLabel>
            <RadioGroup onValueChange={(value: 'upload' | 'library') => { setImageSourceState(value); form.setValue("mediaLibraryItemId", undefined); setSelectedFile(null); }} defaultValue={imageSourceState} className="flex flex-col space-y-1">
              <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="upload" id="upload-image" /></FormControl><FormLabel className="font-normal" htmlFor="upload-image">Upload New Image</FormLabel></FormItem>
              <FormItem className="flex items-center space-x-3 space-y-0"><FormControl><RadioGroupItem value="library" id="select-from-library" /></FormControl><FormLabel className="font-normal" htmlFor="select-from-library">Select from Media Library</FormLabel></FormItem>
            </RadioGroup>
          </div>
        )}

        {/* Conditional File Upload Input */}
        {attachImageState && imageSourceState === "upload" && (
         <FormField control={form.control} name="mediaLibraryItemId" render={() => (
            <FormItem>
              <FormLabel htmlFor="upload-image-file">Upload Image File</FormLabel>
              <FormControl>
                 <Input type="file" accept="image/jpeg, image/png, image/gif" id="upload-image-file" onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setSelectedFile(file);
                  if (file) form.clearErrors("mediaLibraryItemId");
                }} />
              </FormControl>
                 {selectedFile && <FormDescription>Selected: {selectedFile.name}</FormDescription>}
                <FormMessage />
              </FormItem>
            )} />
        )}

         {/* Conditional Media Library Select */}
         {attachImageState && imageSourceState === "library" && (
           <MediaLibrarySelect formControl={form.control} setValue={form.setValue} />
         )}

        {/* Default Name Value Input */}
        <FormField control={form.control} name="defaultNameValue" render={({ field }) => (
            <FormItem>
              <FormLabel>Default Name Value</FormLabel> 
              <FormControl><Input placeholder="e.g., Friend, Valued Customer" {...field} /></FormControl>
              <FormDescription>This value will be used if a contact's name is missing when using the <code>{`{Name}`}</code> placeholder in the template.</FormDescription>
              <FormMessage />
            </FormItem>
        )} />

        {/* Scheduled At Date/Time Picker */}
        <FormField control={form.control} name="scheduledAt" render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Scheduled Time</FormLabel>
              <FormControl>
                <DateTimePicker data-testid="scheduledAt" onChange={value => { field.onChange(value); }} value={field.value} minDate={new Date()} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm [&>div>input]:border-none [&>div>input]:bg-transparent [&>div>input]:outline-none [&>div>button]:text-foreground" />
              </FormControl>
              <FormDescription>Select the date and time when the campaign should start sending messages.</FormDescription>
              <FormMessage />
            </FormItem>
        )} />

        <Button type="submit" disabled={isSubmitting || contactListsQuery.isLoading || templatesQuery.isLoading}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSubmitting ? "Scheduling..." : "Schedule Campaign"}
        </Button>
      </form>
    </Form>
  );
}

// Define type for the data returned by mediaLibrary.list
type MediaListItem = { id: string; filename: string; createdAt: Date; mimeType: string; };

// Helper component for Media Library Select
function MediaLibrarySelect({ formControl, setValue }: { formControl: Control<CampaignFormValues>; setValue: UseFormSetValue<CampaignFormValues>; }) {
  const mediaLibraryQuery = api.mediaLibrary.list.useQuery(undefined, { enabled: true, staleTime: 300000 });
  return (
    <FormField control={formControl} name="mediaLibraryItemId" render={({ field }) => (
        <FormItem>
          <FormLabel>Select Image from Library</FormLabel>
          <Select onValueChange={field.onChange} value={field.value ?? ""} disabled={mediaLibraryQuery.isLoading}>
            <FormControl><SelectTrigger><SelectValue placeholder="Select an image..." /></SelectTrigger></FormControl>
            <SelectContent>
              {mediaLibraryQuery.isLoading && <SelectItem value="loading" disabled>Loading...</SelectItem>}
              {mediaLibraryQuery.data?.map((item: MediaListItem) => (<SelectItem key={item.id} value={item.id}>{item.filename} ({format(new Date(item.createdAt), 'PP')})</SelectItem>))}
              {mediaLibraryQuery.isSuccess && mediaLibraryQuery.data?.length === 0 && (<SelectItem value="no-items" disabled>No images found in library.</SelectItem>)}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
    )} />
  );
}