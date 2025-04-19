import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "~/server/auth";

export default async function Home() {
  const session = await auth();

  // Redirect logged-in users to the dashboard
  if (session?.user) {
    redirect("/dashboard");
  }

  // Render the landing page for logged-out users
  return (
    <main className="flex min-h-screen flex-col">
      {/* Hero Section */}
      <section className="flex flex-1 flex-col items-center justify-center bg-[#128C7E] px-4 py-16 text-white sm:py-24">
        <div className="container mx-auto max-w-4xl text-center">
          <h1 className="mb-4 text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
            Automate Your WhatsApp Promotions Effortlessly
          </h1>
          <p className="mb-8 text-lg text-gray-200 sm:text-xl md:text-2xl">
            Schedule templated messages, manage contacts via CSV, and engage your
            audience directly via WhatsApp using your own number.
          </p>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/auth/signup"
              className="rounded-full bg-[#25D366] px-8 py-3 font-semibold text-white no-underline transition hover:bg-opacity-90"
            >
              Sign Up Now
            </Link>
            <Link
              href="/auth/signin"
              className="rounded-full bg-white/20 px-8 py-3 font-semibold text-white no-underline transition hover:bg-white/30"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-white px-4 py-16 sm:py-24">
        <div className="container mx-auto max-w-4xl">
          <h2 className="mb-12 text-center text-3xl font-bold text-[#111B21] sm:text-4xl">
            Key Features
          </h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
            <div className="text-center">
              <h3 className="mb-2 text-xl font-semibold text-[#075E54]">
                Connect Your Number
              </h3>
              <p className="text-gray-600">
                Easily link your WhatsApp account via QR code or pairing code.
              </p>
            </div>
            <div className="text-center">
              <h3 className="mb-2 text-xl font-semibold text-[#075E54]">
                Manage Contacts
              </h3>
              <p className="text-gray-600">
                Upload and organize your contact lists simply using CSV files.
              </p>
            </div>
            <div className="text-center">
              <h3 className="mb-2 text-xl font-semibold text-[#075E54]">
                Create Templates
              </h3>
              <p className="text-gray-600">
                Design reusable message templates with personalization support.
              </p>
            </div>
            <div className="text-center">
              <h3 className="mb-2 text-xl font-semibold text-[#075E54]">
                Schedule Campaigns
              </h3>
              <p className="text-gray-600">
                Send bulk promotional messages at the date and time you choose.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Disclaimer Section */}
      <section className="bg-[#ECE5DD] px-4 py-8 sm:py-12">
        <div className="container mx-auto max-w-4xl text-center">
          <h3 className="mb-2 text-lg font-semibold text-[#111B21]">
            Important Notice
          </h3>
          <p className="text-sm text-gray-700">
            Please be aware that using automation tools with WhatsApp carries a
            risk of your number being blocked by WhatsApp if misused for spam or
            excessive messaging. Use this service responsibly and at your own
            risk.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#075E54] px-4 py-6 text-white">
        <div className="container mx-auto text-center text-sm">
          &copy; {new Date().getFullYear()} WAHA Gateway Dashboard. All rights
          reserved.
        </div>
      </footer>
    </main>
  );
}
