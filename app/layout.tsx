import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Drone Surevelliance App",
  description: "Drone Surevelliance App",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
