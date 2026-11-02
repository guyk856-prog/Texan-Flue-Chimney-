import Link from "next/link";
import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  icons: { icon: "/brand/favicon.webp", apple: "/brand/favicon.webp" },
  manifest: "/manifest.webmanifest",
  title: "Texan Flue | Management",
  description: "Texan Flue Chimney Service team workspace",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {children}
        <footer className="app-footer">
          <Link href="/legal/terms">Terms of Service</Link>
          <Link href="/legal/privacy">Privacy Policy</Link>
          <span>Texan Flue Chimney Service · Fully Insured</span>
        </footer>
      </body>
    </html>
  );
}
