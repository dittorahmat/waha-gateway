"use client"; // Required for hooks like useState, useEffect, and tRPC hooks

import React, { useState, useMemo } from "react"; // Import useState and useMemo
import Link from "next/link";
import { type ColumnDef, type PaginationState } from "@tanstack/react-table"; // Import PaginationState
import { MoreHorizontal, ArrowUpDown } from "lucide-react";
import { format } from 'date-fns'; // For date formatting
import type { inferRouterOutputs } from '@trpc/server'; // Import inferRouterOutputs
import type { AppRouter } from '~/server/api/root'; // Import AppRouter type

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DataTable } from "../../../components/data-table"; // Use relative path
import { api } from "~/trpc/react"; // Import tRPC API hook
// import { type Campaign } from "@prisma/client"; // No longer need the full Campaign type here
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner"; // For notifications

// Infer the output type of the campaign.list procedure
type RouterOutput = inferRouterOutputs<AppRouter>;
type CampaignListItem = RouterOutput['campaign']['list']['campaigns'][number];

// Define columns for the DataTable using the inferred type
const getColumns = (
  resumeMutation: ReturnType<typeof api.campaign.resume.useMutation>,
  deleteMutation: ReturnType<typeof api.campaign.delete.useMutation>,
  utils: ReturnType<typeof api.useUtils>
): ColumnDef<CampaignListItem>[] => [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Name
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
  },
  {
    accessorKey: "status",
     header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Status
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(row.original.status)}`}>{row.original.status}</span>
  },
  {
    header: "Progress",
    cell: ({ row }) => `${row.original.sentCount} / ${row.original.totalContacts}`,
  },
  {
    accessorKey: "scheduledAt",
    header: "Scheduled At",
    cell: ({ row }) => format(new Date(row.original.scheduledAt), 'PPpp'), // Format date nicely
  },
   {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Created At
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => format(new Date(row.original.createdAt), 'PPp'), // Format date nicely
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const campaign = row.original;

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
            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(campaign.id)}>
              Copy Campaign ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* Conditionally render Resume button */}
            {campaign.status === 'Paused' && (
              <DropdownMenuItem
                disabled={resumeMutation.isPending}
                onClick={() => {
                  toast.info(`Attempting to resume campaign: ${campaign.name}`);
                  resumeMutation.mutate(
                    { campaignId: campaign.id },
                    {
                      onSuccess: () => {
                        toast.success(`Campaign "${campaign.name}" resume initiated.`);
                        utils.campaign.list.invalidate(); // Refresh list on success
                      },
                      onError: (error) => {
                        toast.error(`Failed to resume campaign: ${error.message}`);
                        console.error("Resume error:", error);
                      },
                    }
                  );
                }}
              >
                {resumeMutation.isPending ? "Resuming..." : "Resume"}
              </DropdownMenuItem>
            )}
            {/* Delete Button */}
             <DropdownMenuItem
                className="text-red-600 focus:text-red-700 focus:bg-red-50"
                disabled={deleteMutation.isPending}
                onClick={() => {
                    if (confirm(`Are you sure you want to delete campaign "${campaign.name}"? This cannot be undone.`)) {
                        toast.info(`Attempting to delete campaign: ${campaign.name}`);
                        deleteMutation.mutate(
                            { campaignId: campaign.id },
                            {
                            onSuccess: () => {
                                toast.success(`Campaign "${campaign.name}" deleted successfully.`);
                                utils.campaign.list.invalidate(); // Refresh list on success
                            },
                            onError: (error) => {
                                toast.error(`Failed to delete campaign: ${error.message}`);
                                console.error("Delete error:", error);
                            },
                            }
                        );
                    }
                }}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

// Helper function for status color styling
const getStatusColor = (status: string) => {
  switch (status) {
    case 'Scheduled': return 'bg-blue-100 text-blue-800';
    case 'Running': return 'bg-yellow-100 text-yellow-800';
    case 'Paused': return 'bg-orange-100 text-orange-800';
    case 'Completed': return 'bg-green-100 text-green-800';
    case 'Failed': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};


export default function CampaignsPage() {
  const utils = api.useUtils(); // Get tRPC utils for invalidation

  // --- Pagination State ---
  const [{ pageIndex, pageSize }, setPagination] =
    useState<PaginationState>({
      pageIndex: 0, // Initial page index (0-based)
      pageSize: 10, // Initial page size
    });

  const pagination = useMemo(
    () => ({
      pageIndex,
      pageSize,
    }),
    [pageIndex, pageSize]
  );
  // --- End Pagination State ---

  // --- tRPC Query ---
  const campaignsQuery = api.campaign.list.useQuery(
    {
      page: pageIndex + 1, // API uses 1-based page number
      pageSize: pageSize,
    }
    // Removed keepPreviousData option as it caused TS error
    // TanStack Query's default behavior might suffice or use placeholderData if needed
  );
  // --- End tRPC Query ---

  const resumeMutation = api.campaign.resume.useMutation(); // Resume mutation hook
  const deleteMutation = api.campaign.delete.useMutation(); // Delete mutation hook

  // --- Calculate Page Count ---
  const pageCount = useMemo(() => {
    return campaignsQuery.data?.totalCount
      ? Math.ceil(campaignsQuery.data.totalCount / pageSize)
      : 0;
  }, [campaignsQuery.data?.totalCount, pageSize]);
  // --- End Calculate Page Count ---

  // Memoize columns to prevent re-creation on every render
  const columns = useMemo(
    () => getColumns(resumeMutation, deleteMutation, utils),
    [resumeMutation, deleteMutation, utils] // Dependencies for memoization
  );

  // Handle loading and error states
  const isLoading = campaignsQuery.isLoading;
  const isError = campaignsQuery.isError;
  const error = campaignsQuery.error;
  const campaignData = campaignsQuery.data?.campaigns ?? []; // Default to empty array

  return (
    <div className="container mx-auto py-10">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Campaigns</CardTitle>
              <CardDescription>View and manage your campaigns.</CardDescription>
            </div>
            <Link href="/dashboard/campaigns/create">
              <Button>Create New Campaign</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && <p>Loading campaigns...</p>} {/* Simplified loading check */}
          {isError && <p className="text-red-600">Error loading campaigns: {error?.message}</p>}
          {!isLoading && !isError && (
            <DataTable
              columns={columns}
              data={campaignData} // campaignData is now correctly typed as CampaignListItem[]
              // --- Pass Pagination Props ---
              pageCount={pageCount}
              pagination={pagination}
              onPaginationChange={setPagination}
              // --- Optional Filtering ---
              // filterColumnId="name" // Example: If you want to filter by name
              // filterPlaceholder="Filter by name..."
            />
          )}
           {/* Show 'No results' only if not loading and data array is empty */}
           {!isLoading && !isError && campaignData.length === 0 && (
             <p className="text-muted-foreground text-center py-4">No campaigns found. Create one to get started!</p>
           )}
        </CardContent>
      </Card>
    </div>
  );
}