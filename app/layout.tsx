import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { AppProviders } from "@/components/providers";
import { brandMetadata } from "@/lib/brand";
import "./identity-design-system.css";
import "./identity-tokens.css";
import "./globals.css";
import "./premium-experience.css";
import "./action-feedback.css";
import "./workspace-refinement.css";
import "./session-workspace.css";
import "@/components/coaching-intelligence/coaching-intelligence.css";
import "@/components/identity-intelligence/identity-intelligence.css";
import "@/components/summary-insights/summary-insights.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: brandMetadata.title,
  description: brandMetadata.description,
  applicationName: brandMetadata.applicationName,
  openGraph: {
    title: brandMetadata.openGraph.title,
    description: brandMetadata.openGraph.description,
    siteName: brandMetadata.openGraph.siteName,
  },
  twitter: {
    title: brandMetadata.twitter.title,
    description: brandMetadata.twitter.description,
  },
  appleWebApp: {
    title: brandMetadata.applicationName,
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${poppins.variable} ${poppins.className}`}>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
