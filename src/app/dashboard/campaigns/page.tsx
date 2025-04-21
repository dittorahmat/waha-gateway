import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function CampaignsPage() {
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
          <p className="text-muted-foreground">
            Campaign list functionality will be implemented here.
          </p>
          {/* Placeholder for campaign data table */}
        </CardContent>
      </Card>
    </div>
  );
}