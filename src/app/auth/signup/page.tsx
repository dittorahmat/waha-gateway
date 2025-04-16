"use client"; // Mark as a Client Component

import React, { useState } from "react";
import { useRouter } from "next/navigation"; // Import useRouter for redirection
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { api } from "~/trpc/react"; // Import the tRPC API client

const SignUpPage = () => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null); // State for error messages

  const signupMutation = api.auth.signup.useMutation({
    onSuccess: () => {
      // Redirect to sign-in page on successful signup
      router.push("/auth/signin");
    },
    onError: (error) => {
      // Set error message on failure
      setError(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); // Clear previous errors
    signupMutation.mutate({ email, password });
  };

  return (
    <div className="flex justify-center items-center h-screen">
      <Card className="w-96">
        <CardHeader>
          <CardTitle className="text-center">Sign Up</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  placeholder="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required // Add basic validation
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  placeholder="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required // Add basic validation
                  minLength={8} // Add basic validation
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>} {/* Display error message */}
              <Button type="submit" disabled={signupMutation.isPending}> {/* Disable button while loading */}
                {signupMutation.isPending ? "Signing Up..." : "Sign Up"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default SignUpPage;