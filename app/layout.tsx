import type { Metadata } from "next";
import truthData from "../data/truth.generated.json";
import faviconData from "../data/favicon.generated.json";
import { resolveAssetPath } from "../lib/asset-path.mjs";
import { TruthChrome } from "./truth-chrome";
import { QSiteEditor } from "./q-site-editor";
import { QSiteMarkers } from "./q-site-markers";
import { QFontEditorStable } from "./q-font-editor-stable";
import { QFontMenuBridge } from "./q-font-menu-bridge";
import "./globals.css";
import "./middle-row-only.css";
import "./editorial-overrides.css";
import "./q-site-editor.css";
import "./q-font-editor.css";
import "./q-font-menu-bridge.css";

const faviconHref = resolveAssetPath(faviconData.href || "/favicon.svg");

export const metadata: Metadata = {
  title: truthData.site.row_heading,
  description: `${truthData.site.row_heading} portfolio`,
  icons: {
    icon: faviconHref,
    shortcut: faviconHref,
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
        <QSiteMarkers />
        <QSiteEditor />
        <QFontEditorStable />
        <QFontMenuBridge />
      </body>
    </html>
  );
}
