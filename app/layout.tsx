import type { Metadata } from "next";
import truthData from "../data/truth.generated.json";
import { resolveAssetPath } from "../lib/asset-path.mjs";
import { TruthChrome } from "./truth-chrome";
import "./globals.css";
import "./middle-row-only.css";

export const metadata: Metadata = {
  title: `${truthData.site.row_heading} — ${truthData.site.row_subheader}`,
  description: `${truthData.site.row_heading} portfolio`,
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
      <body>
        {children}
        <TruthChrome />
      </body>
    </html>
  );
}
