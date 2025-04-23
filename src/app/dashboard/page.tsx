 "use client"; // Convert to Client Component

 import React from "react";
 import Link from "next/link"; // Import Link
 import { format } from 'date-fns'; // For date formatting
 import { api } from "~/trpc/react"; // Import tRPC hook
 import { ConnectionStatus } from "./_components/ConnectionStatus";
 import { SendMessageForm } from "./_components/SendMessageForm";
 import { Button } from "@/components/ui/button"; // Import Button
 import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"; // Import Card components
 import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"; // Import Table components
 import type { inferRouterOutputs } from '@trpc/server';
 import type { AppRouter } from '~/server/api/root';

 // Infer the output type for list items
 type RouterOutput = inferRouterOutputs<AppRouter>;
 type CampaignListItem = RouterOutput['campaign']['list']['campaigns'][number];

 // Helper function for status color styling (copied from campaigns/page.tsx)
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


 const DashboardPage = () => {
   // Fetch recent campaigns (limit to 5)
   const recentCampaignsQuery = api.campaign.list.useQuery({ page: 1, pageSize: 5 });

   return (
     <div className="container mx-auto py-10 space-y-8">
       <div className="flex justify-between items-center">
         <h1 className="text-3xl font-bold">Dashboard</h1>
         {/* Add Create Campaign Button */}
         <Link href="/dashboard/campaigns/create">
           <Button>Create New Campaign</Button>
         </Link>
       </div>

       {/* Grid for Status/Send Form and Recent Campaigns */}
       <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

         {/* Column 1 & 2: Recent Campaigns */}
         <Card className="lg:col-span-2">
           <CardHeader>
             <CardTitle>Recent Campaigns</CardTitle>
             <CardDescription>Your 5 most recently created campaigns.</CardDescription>
           </CardHeader>
           <CardContent>
             {recentCampaignsQuery.isLoading && <p>Loading recent campaigns...</p>}
             {recentCampaignsQuery.error && <p className="text-red-600">Error: {recentCampaignsQuery.error.message}</p>}
             {recentCampaignsQuery.data && recentCampaignsQuery.data.campaigns.length > 0 && (
               <Table>
                 <TableHeader>
                   <TableRow>
                     <TableHead>Name</TableHead>
                     <TableHead>Status</TableHead>
                     <TableHead>Progress</TableHead>
                     <TableHead>Scheduled At</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {recentCampaignsQuery.data.campaigns.map((campaign: CampaignListItem) => (
                     <TableRow key={campaign.id}>
                       <TableCell className="font-medium">{campaign.name}</TableCell>
                       <TableCell>
                         <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(campaign.status)}`}>
                           {campaign.status}
                         </span>
                       </TableCell>
                       <TableCell>{`${campaign.sentCount} / ${campaign.totalContacts}`}</TableCell>
                       <TableCell>{format(new Date(campaign.scheduledAt), 'PPp')}</TableCell>
                     </TableRow>
                   ))}
                 </TableBody>
               </Table>
             )}
              {recentCampaignsQuery.data && recentCampaignsQuery.data.campaigns.length === 0 && !recentCampaignsQuery.isLoading && (
                <p className="text-muted-foreground text-center py-4">No recent campaigns found.</p>
              )}
           </CardContent>
         </Card>

         {/* Column 3: Connection Status & Send Form */}
         <div className="space-y-8">
           <ConnectionStatus />
           <SendMessageForm />
         </div>

       </div>
     </div>
   );
 };

 export default DashboardPage;