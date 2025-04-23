"use client";

import React, { useState, useMemo } from "react"; // Import useState and useMemo
import { toast } from "sonner"; // Import toast
import { api } from "~/trpc/react";
import type { ColumnDef } from "@tanstack/react-table";
import type { MessageTemplate } from "@prisma/client";
import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTable } from "~/components/data-table"; // Corrected path
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter, // Import DialogFooter
  DialogDescription, // Import DialogDescription
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"; // Added AlertDialog imports
import { TemplateForm } from "./_components/template-form"; // Import the form

export default function TemplatesPage() {
  const utils = api.useUtils(); // Get tRPC utils for invalidation
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false); // State for edit dialog
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null); // State for template being edited
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false); // State for delete dialog
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null); // State for template ID being deleted

  const {
    data: templates,
    isLoading,
    error,
  } = api.template.list.useQuery();

  const createTemplateMutation = api.template.create.useMutation({
    onSuccess: async (data) => { // Add 'data' parameter
      toast.success(`Template "${data.name}" created successfully!`);
      await utils.template.list.invalidate(); // Invalidate list query on success
      setIsCreateDialogOpen(false); // Close dialog
    },
    onError: (error) => {
      // Error handled globally by queryClient config
      console.error("Failed to create template:", error);
    },
  });

  const updateTemplateMutation = api.template.update.useMutation({
    onSuccess: async (data) => { // Add 'data' parameter
      toast.success(`Template "${data.name}" updated successfully!`);
      await utils.template.list.invalidate(); // Invalidate list query
      setIsEditDialogOpen(false); // Close dialog
      setEditingTemplate(null); // Clear editing state
    },
    onError: (error) => {
      // Error handled globally by queryClient config
      console.error("Failed to update template:", error);
    },
  });

  const deleteTemplateMutation = api.template.delete.useMutation({
    onSuccess: async () => { // Keep existing signature
      toast.success(`Template deleted successfully!`);
      await utils.template.list.invalidate(); // Invalidate list query
      setIsDeleteDialogOpen(false); // Close dialog
      setDeletingTemplateId(null); // Clear deleting state
    },
    onError: (error) => {
      // Error handled globally by queryClient config
      console.error("Failed to delete template:", error);
      // Keep dialog open on error? Or close and show toast?
      // setIsDeleteDialogOpen(false);
      // setDeletingTemplateId(null);
    },
  });


  const handleCreateSubmit = async (values: { name: string; textContent: string }) => {
    await createTemplateMutation.mutateAsync(values);
  };

  const handleUpdateSubmit = async (values: { name: string; textContent: string }) => {
    if (!editingTemplate) return; // Should not happen if dialog is open
    await updateTemplateMutation.mutateAsync({
      id: editingTemplate.id,
      ...values,
    });
  };


  // --- Define Columns inside the component ---
  // This is necessary because handleEdit/handleDelete need access to state/mutations
  const columns: ColumnDef<MessageTemplate>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Name",
      },
      {
        id: "actions",
        cell: ({ row }) => {
          const template = row.original;

          const handleEdit = (templateToEdit: MessageTemplate) => {
            setEditingTemplate(templateToEdit);
            setIsEditDialogOpen(true);
          };
          const handleDelete = (templateId: string) => {
            setDeletingTemplateId(templateId);
            setIsDeleteDialogOpen(true);
          };

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
                  onClick={() => navigator.clipboard.writeText(template.id)}
                >
                  Copy Template ID
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleEdit(template)}>Edit</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDelete(template.id)} className="text-red-600 hover:!text-red-700">
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    // Add state setters to dependency array
    [setIsEditDialogOpen, setEditingTemplate, setIsDeleteDialogOpen, setDeletingTemplateId],
  );
  // --- End Columns Definition ---


  // Handle loading and error states before rendering the main layout
  if (isLoading) {
    // Consistent loading message style
    return <div className="container mx-auto py-10 px-4 sm:px-6 lg:px-8 text-center text-muted-foreground">Loading templates...</div>;
  }

  if (error) {
     // Consistent error message style
    return <div className="container mx-auto py-10 px-4 sm:px-6 lg:px-8 text-center text-red-600">Error loading templates: {error.message}</div>;
  }

  // Main page content
  return (
    <div className="container mx-auto py-10 px-4 sm:px-6 lg:px-8"> {/* Added horizontal padding */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Message Templates</h1>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>Create Template</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]"> {/* Adjust width if needed */}
            <DialogHeader>
              <DialogTitle>Create New Template</DialogTitle>
              <DialogDescription>
                Fill in the details for your new message template.
              </DialogDescription>
            </DialogHeader>
            <TemplateForm
              onSubmit={handleCreateSubmit}
              isSubmitting={createTemplateMutation.isPending}
              submitButtonText="Create Template"
              onCancel={() => setIsCreateDialogOpen(false)} // Add cancel handler
            />
            {/* DialogFooter can be removed if buttons are handled within the form */}
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Edit Template</DialogTitle>
              <DialogDescription>
                Update the details for your message template.
              </DialogDescription>
            </DialogHeader>
            <TemplateForm
              initialData={editingTemplate} // Pass the template being edited
              onSubmit={handleUpdateSubmit}
              isSubmitting={updateTemplateMutation.isPending}
              submitButtonText="Save Changes"
              onCancel={() => {
                setIsEditDialogOpen(false);
                setEditingTemplate(null);
              }}
            />
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the
                message template.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeletingTemplateId(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (deletingTemplateId) {
                    await deleteTemplateMutation.mutateAsync({ id: deletingTemplateId });
                  }
                }}
                disabled={deleteTemplateMutation.isPending}
                className="bg-red-600 hover:bg-red-700" // Destructive action style
              >
                {deleteTemplateMutation.isPending ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
      {templates && templates.length > 0 ? (
        <DataTable
          columns={columns}
          data={templates} // Use templates directly since we checked length
          pageCount={1} // Provide dummy pageCount for non-paginated table
          pagination={{ pageIndex: 0, pageSize: templates.length }} // Provide dummy pagination state
          onPaginationChange={() => {}} // Provide dummy handler
          filterColumnId="name"
          filterPlaceholder="Filter by name..."
        />
      ) : (
        // Consistent "No results" message
        <p className="text-muted-foreground text-center py-4">No templates found. Create one to get started!</p>
      )}
    </div>
  );
}