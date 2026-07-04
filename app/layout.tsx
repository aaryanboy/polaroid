import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Same Sky — a photo booth for long distance",
  description:
    "Connect two cameras across any distance, count down together, and walk away with one shared photo.",
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
