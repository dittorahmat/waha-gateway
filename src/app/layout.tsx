import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";

import { Toaster } from "~/components/ui/sonner"; // Import Sonner Toaster
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "WA Blast",
  description: "created by Ditto",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <body>
        <TRPCReactProvider>{children}</TRPCReactProvider>
        <Toaster /> {/* Add Toaster here */}
      </body>
    </html>
  );
}
