"use client";

import React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

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
import { Textarea } from "@/components/ui/textarea";
import type { MessageTemplate } from "@prisma/client";

// Define the form schema using Zod, matching the backend validation
const formSchema = z.object({
  name: z.string().min(1, "Name cannot be empty"),
  textContent: z.string().min(1, "Content cannot be empty"),
});

type TemplateFormValues = z.infer<typeof formSchema>;

interface TemplateFormProps {
  initialData?: MessageTemplate | null; // For editing
  onSubmit: (values: TemplateFormValues) => Promise<void>;
  isSubmitting: boolean;
  submitButtonText?: string;
  onCancel?: () => void; // Optional: Function to call when cancelling/closing
}

export function TemplateForm({
  initialData,
  onSubmit,
  isSubmitting,
  submitButtonText = "Save Template",
  onCancel,
}: TemplateFormProps) {
  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData?.name ?? "",
      textContent: initialData?.textContent ?? "",
    },
  });

  // Reset form if initialData changes (e.g., when opening edit dialog)
  React.useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name,
        textContent: initialData.textContent,
      });
    } else {
      form.reset({ name: "", textContent: "" }); // Reset for create
    }
  }, [initialData, form]);


  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values);
    // Optionally reset form after successful submission if needed
    // if (!initialData) { // Only reset fully on create?
    //   form.reset({ name: "", textContent: "" });
    // }
  });

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Template Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Appointment Reminder" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="textContent"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Message Content</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Write your message here..."
                  className="min-h-[150px]"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                You can use basic Markdown for formatting and{" "}
                <code>{`{Name}`}</code> as a placeholder for the recipient's name.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end space-x-2 pt-4">
           {onCancel && (
             <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
               Cancel
             </Button>
           )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : submitButtonText}
          </Button>
        </div>
      </form>
    </Form>
  );
}