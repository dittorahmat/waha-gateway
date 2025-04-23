import React from 'react';
import CampaignForm from './_components/campaign-form'; // Correct: Use default import
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"; // Assuming breadcrumbs are used

export default function CreateCampaignPage() {
  return (
    // Add container, padding, and max-width for better layout consistency
    <div className="container mx-auto max-w-3xl py-10 px-4 sm:px-6 lg:px-8 space-y-6">
       <Breadcrumb>
         <BreadcrumbList>
           <BreadcrumbItem>
             <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
           </BreadcrumbItem>
           <BreadcrumbSeparator />
           <BreadcrumbItem>
             <BreadcrumbLink href="/dashboard/campaigns">Campaigns</BreadcrumbLink>
           </BreadcrumbItem>
           <BreadcrumbSeparator />
           <BreadcrumbItem>
             <BreadcrumbPage>Create</BreadcrumbPage>
           </BreadcrumbItem>
         </BreadcrumbList>
       </Breadcrumb>

      <h1 className="text-3xl font-bold">Create New Campaign</h1>
      <p className="text-muted-foreground">
        Configure and schedule a new messaging campaign.
      </p>
      {/* The actual form component will be rendered here */}
      <CampaignForm />
    </div>
  );
}