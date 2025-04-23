"use client"; // Required for hooks

import React, { useState, useEffect, useRef } from "react"; // Added useEffect, useRef
import Image from "next/image"; // Use Next.js Image for potential optimization
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { toast } from "sonner"; // Using sonner for notifications

export function ConnectionStatus() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const previousStatusRef = useRef<string | null>(null); // Ref to store previous status

  // Query to get the current session state, polling every 5 seconds
  const sessionStateQuery = api.waha.getSessionState.useQuery(undefined, {
    refetchInterval: 5000, // Poll every 5 seconds
    refetchOnWindowFocus: true, // Refetch when window gains focus
    staleTime: 4000, // Consider data stale after 4 seconds
  });

  // --- Mutations ---
  const utils = api.useUtils(); // Get tRPC utils for invalidation

  const startSessionMutation = api.waha.startSession.useMutation({
    onSuccess: (data) => {
      toast.success(data.message ?? "Session start initiated.");
      void utils.waha.getSessionState.invalidate(); // Refetch state after mutation
    },
    onError: (error) => {
      toast.error(`Failed to start session: ${error.message}`);
    },
  });

  const logoutSessionMutation = api.waha.logoutSession.useMutation({
    onSuccess: (data) => {
      toast.success(data.message ?? "Logout successful.");
      void utils.waha.getSessionState.invalidate();
    },
    onError: (error) => {
      toast.error(`Logout failed: ${error.message}`);
    },
  });

  const requestPairingCodeMutation =
    api.waha.requestPairingCode.useMutation({
      onSuccess: (data) => {
        if (data.code) {
          // WAHA might not return the code directly in the response,
          // it might just confirm the request was sent to the phone.
          toast.success(
            `Pairing code requested successfully. Check your WhatsApp linked devices screen. Code (if provided): ${data.code}`,
          );
        } else {
          toast.success(
            "Pairing code requested. Check your WhatsApp linked devices screen.",
          );
        }
        // No need to invalidate here unless requesting code changes the main status
      },
      onError: (error) => {
        toast.error(`Failed to request pairing code: ${error.message}`);
      },
    });
  // --- End Mutations ---

  // --- Effect for Connection Success Toast ---
  useEffect(() => {
    const currentStatus = sessionStateQuery.data?.status;
    const previousStatus = previousStatusRef.current;

    // Check if status changed to 'WORKING' from a different state
    if (
      currentStatus === "WORKING" &&
      previousStatus !== "WORKING" &&
      previousStatus !== null // Avoid toast on initial load if starting as WORKING
    ) {
      toast.success("WhatsApp connected successfully!");
    }

    // Update previous status ref for the next render
    if (currentStatus !== previousStatus) {
       previousStatusRef.current = currentStatus ?? null;
    }
    // Only run when query data changes
  }, [sessionStateQuery.data?.status]);
  // --- End Effect ---


  // --- Render Logic ---
  const renderContent = () => {
    if (sessionStateQuery.isLoading) {
      return <p>Loading connection status...</p>;
    }

    if (sessionStateQuery.isError) {
      return (
        <p className="text-red-600">
          Error loading status: {sessionStateQuery.error.message}
        </p>
      );
    }

    const { data } = sessionStateQuery;

    // Add check for undefined data after loading/error states
    if (!data) {
      // This case might occur briefly between loading and receiving data,
      // or if the query somehow returns undefined without an error.
      return <p>Waiting for connection data...</p>;
    }

    // Handle case where session exists but API fetch failed
    // Now 'data' is guaranteed to be defined here
    if (data.connected && data.error) {
      return (
        <>
          <p className="text-orange-600">
            Warning: Could not fetch latest status from WAHA. Displaying last
            known status: {data.status}
          </p>
          <Button
            onClick={() => logoutSessionMutation.mutate()}
            disabled={logoutSessionMutation.isPending}
            variant="destructive"
            className="mt-2"
          >
            {logoutSessionMutation.isPending ? "Logging out..." : "Logout"}
          </Button>
        </>
      );
    }

    // Not Connected
    if (!data.connected) {
      return (
        <>
          <CardDescription>
            Your WhatsApp account is not connected.
          </CardDescription>
          <CardFooter className="pt-4">
            <Button
              onClick={() => startSessionMutation.mutate()}
              disabled={startSessionMutation.isPending}
            >
              {startSessionMutation.isPending
                ? "Connecting..."
                : "Connect WhatsApp"}
            </Button>
          </CardFooter>
        </>
      );
    }

    // Connected - Display based on status
    switch (data.status) {
      case "STARTING":
      case "CONNECTING":
        return (
          <>
            <CardDescription>Status: Connecting...</CardDescription>
            <CardFooter className="pt-4">
              <Button
                onClick={() => logoutSessionMutation.mutate()}
                disabled={logoutSessionMutation.isPending}
                variant="destructive"
              >
                {logoutSessionMutation.isPending ? "Logging out..." : "Cancel / Logout"}
              </Button>
            </CardFooter>
          </>
        );

      case "SCAN_QR_CODE":
        return (
          <>
            <CardDescription>
              Scan this QR code with your WhatsApp app (Linked Devices {">"} Link
              a device).
            </CardDescription>
            <CardContent className="flex justify-center p-4">
              {data.qrCode ? (
                <Image
                  // Ensure the src is correctly formatted for base64
                  src={
                    data.qrCode.startsWith("data:image")
                      ? data.qrCode
                      : `data:image/png;base64,${data.qrCode}`
                  }
                  alt="WhatsApp QR Code"
                  width={500}
                  height={500}
                  priority // Load QR code quickly
                />
              ) : (
                <p>Loading QR code...</p>
              )}
            </CardContent>
            <CardFooter>
              <Button
                onClick={() => logoutSessionMutation.mutate()}
                disabled={logoutSessionMutation.isPending}
                variant="destructive"
              >
                {logoutSessionMutation.isPending ? "Logging out..." : "Cancel / Logout"}
              </Button>
            </CardFooter>
          </>
        );

      case "PAIRING_CODE":
        return (
          <>
            <CardDescription>
              Enter the code displayed below on your phone (WhatsApp {">"} Linked
              Devices {">"} Link with phone number).
            </CardDescription>
            <CardContent className="space-y-4 p-4">
              {data.pairingCode ? (
                <p className="text-center text-2xl font-bold tracking-widest">
                  {data.pairingCode}
                </p>
              ) : (
                <p>Waiting for pairing code...</p>
              )}
              {/* Optional: Allow requesting code if not automatically shown */}
              <div className="flex items-end space-x-2 pt-2">
                <div className="flex-grow">
                  <Label htmlFor="phone-number">Phone Number (Optional)</Label>
                  <Input
                    id="phone-number"
                    type="tel"
                    placeholder="e.g., +15551234567"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                  />
                </div>
                <Button
                  onClick={() =>
                    requestPairingCodeMutation.mutate({ phoneNumber })
                  }
                  disabled={
                    !phoneNumber || requestPairingCodeMutation.isPending
                  }
                >
                  {requestPairingCodeMutation.isPending
                    ? "Requesting..."
                    : "Request Code"}
                </Button>
              </div>
            </CardContent>
            <CardFooter>
              <Button
                onClick={() => logoutSessionMutation.mutate()}
                disabled={logoutSessionMutation.isPending}
                variant="destructive"
              >
                {logoutSessionMutation.isPending ? "Logging out..." : "Cancel / Logout"}
              </Button>
            </CardFooter>
          </>
        );

      case "WORKING":
        return (
          <>
            <CardDescription className="text-green-600">
              Status: Connected
            </CardDescription>
            <CardFooter className="pt-4">
              <Button
                onClick={() => logoutSessionMutation.mutate()}
                disabled={logoutSessionMutation.isPending}
                variant="destructive"
              >
                {logoutSessionMutation.isPending ? "Logging out..." : "Logout"}
              </Button>
            </CardFooter>
          </>
        );

      case "FAILED":
      case "TIMEOUT":
      case "STOPPED":
      case "OFFLINE":
      default:
        return (
          <>
            <CardDescription className="text-red-600">
              Status: {data.status ?? "Unknown Error"}
            </CardDescription>
            <CardFooter className="flex justify-between pt-4">
              <Button
                onClick={() => startSessionMutation.mutate()}
                disabled={startSessionMutation.isPending}
                variant="outline"
              >
                {startSessionMutation.isPending ? "Reconnecting..." : "Reconnect"}
              </Button>
              <Button
                onClick={() => logoutSessionMutation.mutate()}
                disabled={logoutSessionMutation.isPending}
                variant="destructive"
              >
                {logoutSessionMutation.isPending ? "Logging out..." : "Logout"}
              </Button>
            </CardFooter>
          </>
        );
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>WhatsApp Connection</CardTitle>
      </CardHeader>
      {renderContent()}
    </Card>
  );
}