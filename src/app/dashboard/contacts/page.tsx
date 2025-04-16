"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Trash2 } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { DataTable } from "~/components/data-table"; // Import DataTable
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"; // Import DropdownMenu
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"; // Import AlertDialog
import { toast } from "sonner"; // Use sonner for toasts
import { api } from "~/trpc/react";
import type { RouterOutputs } from "~/trpc/react"; // Import RouterOutputs type

// Define the type for a single contact list item based on the router output
type ContactList = RouterOutputs["contactList"]["list"][number];
// Zod schema for the upload form
const formSchema = z.object({
  name: z.string().min(1, { message: "List name is required." }),
  file: z.instanceof(FileList).refine((files) => files?.length === 1, "File is required."),
});

type FormValues = z.infer<typeof formSchema>;

export default function ContactListPage() {
  // No need for useToast hook with sonner
  const [isUploading, setIsUploading] = useState(false);

  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [listToDelete, setListToDelete] = useState<ContactList | null>(null);

  const utils = api.useUtils(); // Get tRPC utils for invalidation

  // --- Queries & Mutations ---
  const { data: contactLists, isLoading: isLoadingLists } = api.contactList.list.useQuery();

  const uploadMutation = api.contactList.upload.useMutation({
    onSuccess: (data) => {
      toast.success("Success!", {
         description: `Contact list "${data.name}" uploaded successfully with ${data.contactCount} contacts.`,
      });
      form.reset(); // Reset form on success
      // Invalidate the list query to refresh the table
      void utils.contactList.list.invalidate();
    },
    onError: (error) => {
      toast.error("Upload Failed", {
        description: error.message || "An unknown error occurred.",
      });
    },
    onSettled: () => {
      setIsUploading(false); // Ensure loading state is reset
    },
  });

  const deleteMutation = api.contactList.delete.useMutation({
    onSuccess: () => {
      toast.success("Contact list deleted successfully.");
      void utils.contactList.list.invalidate(); // Refresh list after delete
    },
    onError: (error) => {
      toast.error("Delete Failed", {
        description: error.message || "Could not delete the contact list.",
      });
    },
    onSettled: () => {
      setIsDeleting(false);
      setShowDeleteDialog(false);
      setListToDelete(null);
    },
  });

  // --- Form Hook ---
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      file: undefined,
    },
  });

  // Function to read file as Base64
  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64String = (reader.result as string).split(",")[1]; // Remove data:mime/type;base64, prefix
        if (base64String) {
          resolve(base64String);
        } else {
          reject(new Error("Failed to read file as Base64."));
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  async function onSubmit(values: FormValues) {
    if (!values.file || values.file.length === 0) {
      toast.error("Error", { description: "Please select a CSV file." });
      return;
    }

    const file = values.file[0];

    // Add a check to ensure file is defined (for TypeScript)
    if (!file) {
        toast.error("Error", { description: "File could not be accessed." });
        return;
    }

    if (file.type !== "text/csv" && !file.name.toLowerCase().endsWith(".csv")) {
        toast.error("Error", { description: "Please upload a valid CSV file." });
        return;
    }


    setIsUploading(true);
    try {
      // file is guaranteed to be defined here due to the earlier check
      const fileContentBase64 = await readFileAsBase64(file);
      uploadMutation.mutate({ name: values.name, fileContentBase64 });
    } catch (error) {
      console.error("Error reading file:", error);
      toast.error("Error Reading File", {
         description: error instanceof Error ? error.message : "Could not read the selected file.",
      });
      setIsUploading(false);
    }
  }

  // File input ref for react-hook-form
  const fileRef = form.register("file");

  // --- Delete Handler ---
  const handleDeleteClick = (list: ContactList) => {
    setListToDelete(list);
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (listToDelete) {
      setIsDeleting(true);
      deleteMutation.mutate({ id: listToDelete.id });
    }
  };

  // --- Table Columns ---
  const columns: ColumnDef<ContactList>[] = [
    {
      accessorKey: "name",
      header: "List Name",
    },
    {
      accessorKey: "contactCount",
      header: "Contacts",
    },
    {
      accessorKey: "createdAt",
      header: "Uploaded At",
      cell: ({ row }) => {
        const date = row.getValue("createdAt") as Date;
        return <span>{date.toLocaleDateString()} {date.toLocaleTimeString()}</span>;
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const list = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => handleDeleteClick(list)}
                className="text-red-600 focus:text-red-700 focus:bg-red-50"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete List
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];


  return (
    <div className="container mx-auto py-10">
      <h1 className="mb-6 text-3xl font-bold">Contact Lists</h1>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Upload New List</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>List Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Marketing Leads Q1" {...field} disabled={isUploading} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="file"
                render={({ field }) => ( // field includes value, onChange, onBlur, name, ref
                  <FormItem>
                    <FormLabel>CSV File (headers: phone_number, first_name?)</FormLabel>
                    <FormControl>
                      {/* Use the ref from form.register */}
                      <Input
                        type="file"
                        accept=".csv"
                        disabled={isUploading}
                        {...fileRef} // Spread the ref and other props from register
                        onChange={(event) => {
                          // Manually trigger react-hook-form's onChange
                          field.onChange(event.target.files);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={isUploading}>
                {isUploading ? "Uploading..." : "Upload List"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Contact List Table will go here */}
      <h2 className="mb-4 text-2xl font-semibold">Existing Lists</h2>
      {isLoadingLists ? (
        <p>Loading lists...</p>
      ) : (
        <DataTable
           columns={columns}
           data={contactLists ?? []}
           // isLoading prop removed as it's not supported by the component
           filterColumnId="name" // Correct prop name for filtering
           filterPlaceholder="Filter by name..."
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the contact list
              <span className="font-semibold"> "{listToDelete?.name}" </span>
              and all associated contacts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? "Deleting..." : "Yes, delete list"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
