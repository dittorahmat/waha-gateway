import React from "react";
import { auth } from "~/server/auth"; // Import the auth function
import { redirect } from "next/navigation";

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
      {/* Add more dashboard content here */}
    </div>
  );
};

export default DashboardPage;