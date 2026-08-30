import type { Metadata } from "next";
import { resolveAssetPath } from "../lib/asset-path.mjs";
import "./globals.css";
import "./middle-row-only.css";

export const metadata: Metadata = {
  title: "NUME — Visual Index",
  description: "NUME is a living index of image, form and atmosphere.",
  icons: {
    icon: resolveAssetPath("/favicon.svg"),
    shortcut: resolveAssetPath("/favicon.svg"),
  },
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
