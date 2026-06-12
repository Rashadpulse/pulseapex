import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-outfit",
});

export const metadata: Metadata = {
  title: "PulseApex | Autonomous Document & Financial Auditing Network",
  description: "Enterprise SaaS platform for autonomous corporate document auditing, financial discrepancy analysis, and contract risk detection.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${outfit.variable} h-full antialiased dark`}>
      <body className="min-h-full flex flex-col font-sans bg-[#050508] text-gray-100">
        {children}
      </body>
    </html>
  );
}
