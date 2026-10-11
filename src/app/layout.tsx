import type { Metadata } from "next";
import ThemeProvider from "@/components/layout/ThemeProvider";
import SnackbarProvider from "@/components/ui/SnackbarProvider";
import { themeInitializationScript } from "@/lib/theme";
import "./globals.css";
export const metadata: Metadata = { title: "Nexora", description: "Centralized Business Automation Engine" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-theme="dark" suppressHydrationWarning>
    <head><script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} /></head>
    <body className="bg-gray-50 text-gray-900 scheme-light dark:bg-[#101010] dark:text-[#f5f5f5] dark:scheme-dark"><ThemeProvider><SnackbarProvider>{children}</SnackbarProvider></ThemeProvider></body>
  </html>;
}
