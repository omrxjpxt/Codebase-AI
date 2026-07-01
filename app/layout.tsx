import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CodeBase AI — Understand Any Codebase in Minutes",
  description:
    "Upload a repository and ask questions in plain English. Instantly discover architecture, authentication flows, database schemas and implementation details.",
  keywords: ["codebase", "AI", "code understanding", "developer tool", "repository analysis"],
  authors: [{ name: "CodeBase AI" }],
  openGraph: {
    title: "CodeBase AI — Understand Any Codebase in Minutes",
    description:
      "Upload a repository and ask questions in plain English. AI-powered code understanding for developers.",
    type: "website",
  },
};

import { ThemeProvider } from "@/components/providers/ThemeProvider";
import GlobalSearch from "@/components/layout/GlobalSearch";
import { Toaster } from "sonner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans bg-[#09090B] text-[#FAFAFA] antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <GlobalSearch>
            {children}
          </GlobalSearch>
          <Toaster theme="dark" position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
