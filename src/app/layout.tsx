import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
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
      <body>{children}</body>
    </html>
  );
}
