import React from "react";
import { auth } from "~/server/auth"; // Import the auth function
import { redirect } from "next/navigation";
import { ConnectionStatus } from "./_components/ConnectionStatus";
import { SendMessageForm } from "./_components/SendMessageForm"; // Import the new form

const DashboardPage = async () => {
  const session = await auth(); // Get the session server-side

  if (!session?.user) {
    // If no session, redirect to sign-in page
    redirect("/auth/signin");
  }

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-4">Dashboard</h1>
      <p>Welcome, {session.user.email ?? session.user.name ?? "User"}!</p>

      {/* WAHA Connection Status */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        {/* WAHA Connection Status */}
        <div className="flex justify-center md:justify-end">
          <ConnectionStatus />
        </div>

        {/* Send Message Form */}
        <div className="flex justify-center md:justify-start">
          <SendMessageForm />
        </div>
      </div>

      {/* Add more dashboard content here */}
    </div>
  );
};

export default DashboardPage;