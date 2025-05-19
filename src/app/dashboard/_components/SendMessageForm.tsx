"use client";

import React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { api } from "~/trpc/react";

// Schema for form validation - mirrors the tRPC input schema
const formSchema = z.object({
  chatId: z.string().regex(/^(\d+@c\.us|\d+-\d+@g\.us)$/, {
    message: "Invalid Chat ID (e.g., 1234567890@c.us or 123456-7890@g.us)",
  }),
  text: z.string().min(1, { message: "Message cannot be empty" }),
});

type SendMessageFormValues = z.infer<typeof formSchema>;

export function SendMessageForm() {
  const form = useForm<SendMessageFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      chatId: "",
      text: "",
    },
  });

  const sendMessageMutation = api.waha.sendTextMessage.useMutation({
    onSuccess: (data) => {
      toast.success(
        `Message sent successfully! ${data.messageId ? `(ID: ${data.messageId})` : ""}`,
      );
      form.reset(); // Clear the form on success
    },
    onError: (error) => {
      console.error("Failed to send message:", error); // Log the full error object
      toast.error(`Failed to send message: ${error.message}`);
    },
  });

  function onSubmit(values: SendMessageFormValues) {
    console.log("Submitting message:", values);
    sendMessageMutation.mutate(values);
  }

  // Optional: Check connection status before enabling the form
  const sessionState = api.waha.getSessionState.useQuery();
  const isConnected =
    sessionState.data?.connected && sessionState.data?.status === "WORKING";

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Send Text Message</CardTitle>
        <CardDescription>
          Send a message via your connected WhatsApp account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="chatId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recipient Chat ID</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., 1234567890@c.us or 123456-7890@g.us"
                      {...field}
                      disabled={!isConnected || sendMessageMutation.isPending}
                    />
                  </FormControl>
                  <FormDescription>
                    The recipient's WhatsApp ID (phone@c.us for users, group-id@g.us for groups).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="text"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Message</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Type your message here..."
                      {...field}
                      rows={4}
                      disabled={!isConnected || sendMessageMutation.isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              disabled={!isConnected || sendMessageMutation.isPending}
              className="w-full"
            >
              {sendMessageMutation.isPending
                ? "Sending..."
                : "Send Message"}
            </Button>
            {!isConnected && sessionState.data?.status && (
              <p className="text-sm text-center text-yellow-600">
                WhatsApp must be connected and in 'WORKING' state to send messages (Current: {sessionState.data.status}).
              </p>
            )}
             {!isConnected && !sessionState.data?.status && (
              <p className="text-sm text-center text-red-600">
                WhatsApp connection status unavailable or not connected.
              </p>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}