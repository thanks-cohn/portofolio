"use client";

import { useEffect } from "react";
import truthData from "../data/truth.generated.json";

function mark(
  node: Element | null,
  options: {
    record: "block" | "global";
    field: string;
    product?: string;
    kind?: "text" | "image";
    value?: string;
  },
) {
  if (!(node instanceof HTMLElement)) return;
  node.dataset.qEdit = options.kind || "text";
  node.dataset.qRecord = options.record;
  node.dataset.qField = options.field;
  if (options.product) node.dataset.qProduct = options.product;
  if (options.value !== undefined) node.dataset.qValue = options.value;
}

export function QSiteMarkers() {
  useEffect(() => {
    const apply = () => {
      mark(document.querySelector('.gallery-row[data-nume-row="row_nume_objects"] .merchant-title'), {
        record: "global",
        field: "row_heading",
      });
      mark(document.querySelector('.gallery-row[data-nume-row="row_nume_objects"] .family-title'), {
        record: "global",
        field: "row_subheader",
      });
      mark(document.querySelector(".truth-wordmark span:first-child"), { record: "global", field: "brand_top" });
      mark(document.querySelector(".truth-wordmark span:last-child"), { record: "global", field: "brand_bottom" });
      mark(document.querySelector(".truth-footer > span:first-child"), { record: "global", field: "footer_left" });

      const fixedNavFields: Record<string, string> = {
        home: "nav_home_label",
        acting: "nav_acting_label",
        design: "nav_design_label",
        resume: "nav_resume_label",
        contact: "nav_contact_label",
      };
      const navItems = (truthData.site as unknown as { header_nav?: Array<{ page_key?: string }> }).header_nav || [];
      document.querySelectorAll<HTMLElement>(".truth-nav a").forEach((anchor, index) => {
        const pageKey = navItems[index]?.page_key || "";
        const field = fixedNavFields[pageKey];
        if (field) mark(anchor, { record: "global", field });
      });

      document.querySelectorAll<HTMLElement>('.tile[data-product-id]').forEach((tile) => {
        const product = tile.dataset.productId || "";
        if (!product) return;
        mark(tile.querySelector(".tile-meta b"), { record: "block", product, field: "title" });
        const image = tile.querySelector("img");
        if (image) {
          mark(image, {
            record: "block",
            product,
            field: "image_url",
            kind: "image",
            value: image.getAttribute("src") || image.currentSrc || image.src,
          });
        }
      });

      const selectedProduct = document.querySelector<HTMLElement>(".nume")?.dataset.truthProductId || "";
      if (selectedProduct) {
        mark(document.querySelector(".work-copy h1"), { record: "block", product: selectedProduct, field: "title" });
        mark(document.querySelector(".preview-page h2"), { record: "block", product: selectedProduct, field: "title" });
        mark(document.querySelector(".preview-page p"), { record: "block", product: selectedProduct, field: "description" });
        const heroImage = document.querySelector<HTMLImageElement>(".hero img, .mobile-hero img");
        if (heroImage) {
          mark(heroImage, {
            record: "block",
            product: selectedProduct,
            field: "image_url",
            kind: "image",
            value: heroImage.getAttribute("src") || heroImage.currentSrc || heroImage.src,
          });
        }
      }
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "data-truth-product-id"],
    });
    return () => observer.disconnect();
  }, []);

  return null;
}
