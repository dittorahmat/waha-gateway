import React from "react";
import Link from "next/link";
import { auth, signOut } from "~/server/auth"; // Import signOut
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";

// Simple Nav Component (can be extracted later if needed)
function DashboardNav() {
  return (
    <nav className="bg-secondary text-secondary-foreground p-4 mb-6 shadow-md">
      <div className="container mx-auto flex justify-between items-center">
        <div className="space-x-4">
          <Link href="/dashboard" className="hover:text-primary">
            Dashboard Home
          </Link>
          <Link href="/dashboard/templates" className="hover:text-primary">
            Message Templates
          </Link>
          {/* Add other dashboard links here */}
        </div>
        <div>
          {/* Placeholder for User menu / Sign out */}
          <span className="text-sm">user@example.com</span>
        </div>
      </div>
    </nav>
  );
}


export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth(); // Check auth server-side for the layout

  if (!session?.user) {
    // If no session, redirect to sign-in page from the layout
    redirect("/auth/signin");
  }

  // Update user email in Nav if available
  const userEmail = session.user.email ?? session.user.name ?? "User";

  return (
    <section>
      {/* Include shared UI here e.g. a header or sidebar */}
      <nav className="bg-secondary text-secondary-foreground p-4 mb-6 shadow-md">
        <div className="container mx-auto flex justify-between items-center">
          <div className="space-x-4">
            <Link href="/dashboard" className="hover:text-primary font-medium">
              Dashboard
            </Link>
            <Link href="/dashboard/templates" className="hover:text-primary font-medium">
              Templates
            </Link>
            <Link href="/dashboard/contacts" className="hover:text-primary font-medium">
              Contact Lists
            </Link>
            <Link href="/dashboard/campaigns" className="hover:text-primary font-medium">
              Campaigns
            </Link>
            {/* Add other dashboard links here */}
          </div>
          <div className="flex items-center space-x-2">
             {/* Placeholder for User menu / Sign out */}
             <span className="text-sm">{userEmail}</span>
             <form
               action={async () => {
                 "use server";
                 await signOut({ redirectTo: "/" }); // Redirect to home page after sign out
               }}
             >
               <Button type="submit" variant="outline" size="sm">
                 Sign Out
               </Button>
             </form>
          </div>
        </div>
      </nav>

      {children}
    </section>
  );
}