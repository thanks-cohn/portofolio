"use client";

import { useEffect } from "react";
import truthData from "../data/truth.generated.json";
import { resolveAssetPath } from "../lib/asset-path.mjs";

function resolvedHref(value: string) {
  if (!value) return "";
  if (/^(?:https?:)?\/\//i.test(value) || /^(?:mailto|tel):/i.test(value)) return value;
  return resolveAssetPath(value);
}

function selectedBlock() {
  const indexText = document.querySelector<HTMLElement>(".hero-index, .mobile-hero-index")?.textContent?.trim();
  const index = Number(indexText);
  return Number.isInteger(index) && index > 0 ? truthData.blocks[index - 1] : null;
}

function setText(selector: string, value: string) {
  document.querySelectorAll<HTMLElement>(selector).forEach((node) => { node.textContent = value; });
}

export function TruthChrome() {
  useEffect(() => {
    const applyTruthCopy = () => {
      const main = document.querySelector<HTMLElement>(".nume");
      const previewing = main?.classList.contains("is-previewing") ?? false;
      const block = selectedBlock();
      setText(".hero-action, .mobile-hero-action", `${previewing ? (block?.destination_label || truthData.site.visit_label) : truthData.site.details_label} ↗`);
      setText(".preview-bar span", truthData.site.preview_header);
      const indexText = document.querySelector<HTMLElement>(".hero-index, .mobile-hero-index")?.textContent?.trim() || "";
      document.querySelectorAll<HTMLElement>(".preview-page").forEach((page) => {
        const source = Array.from(page.children).find((child) => child.tagName === "SPAN" && !child.classList.contains("demo-checkout")) as HTMLElement | undefined;
        if (source) source.textContent = `${truthData.site.preview_source_prefix} ${indexText}`.trim();
      });
      setText(".demo-checkout", truthData.site.preview_note);
    };

    const observer = new MutationObserver(applyTruthCopy);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    applyTruthCopy();

    const redirect = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".hero, .mobile-hero")) return;
      const main = document.querySelector<HTMLElement>(".nume");
      if (!main?.classList.contains("is-previewing")) return;
      const block = selectedBlock();
      if (!block?.destination_url) return;
      event.preventDefault();
      event.stopPropagation();
      if ("stopImmediatePropagation" in event) event.stopImmediatePropagation();
      window.location.assign(resolvedHref(block.destination_url));
    };
    document.addEventListener("click", redirect, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", redirect, true);
    };
  }, []);

  const socials = truthData.blocks.filter((block) => block.footer_icon_ref && block.footer_icon_url);

  return (
    <>
      <div className="truth-header" aria-label="Portfolio header">
        <a className="truth-wordmark" href={resolvedHref("/")} aria-label="Quandranea home">
          <span>{truthData.site.brand_top}</span>
          <span>{truthData.site.brand_bottom}</span>
        </a>
        <nav className="truth-nav" aria-label="Portfolio navigation">
          {truthData.site.header_nav.map((item) => (
            <a key={`${item.label}:${item.url}`} href={resolvedHref(item.url)}>{item.label}</a>
          ))}
        </nav>
      </div>

      <footer className="truth-footer">
        <span>{truthData.site.footer_left}</span>
        <span className="truth-socials">
          {socials.map((social) => {
            const ref = social.footer_icon_ref;
            const imageIcon = /^(?:https?:)?\/\//i.test(ref) || ref.startsWith("/") || ref.includes(".");
            return (
              <a key={`${social.product_id}:${social.footer_icon_url}`} href={resolvedHref(social.footer_icon_url)} aria-label={social.footer_icon_label || ref}>
                {imageIcon ? <img src={resolvedHref(ref)} alt={social.footer_icon_label || ""} /> : <span aria-hidden="true">{ref}</span>}
              </a>
            );
          })}
        </span>
      </footer>
    </>
  );
}
