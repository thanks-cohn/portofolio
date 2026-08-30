"use client";

import { useEffect } from "react";
import truthData from "../data/truth.generated.json";
import { resolveAssetPath } from "../lib/asset-path.mjs";

type FontRule = {
  scope: string;
  product_id?: string;
  family: string;
  weight?: string;
  style?: string;
  fallback?: string;
};

type ColorRule = {
  scope: string;
  product_id?: string;
  color: string;
};

const siteStyles = truthData.site as unknown as { font_rules?: FontRule[]; color_rules?: ColorRule[] };
const fontRules = siteStyles.font_rules ?? [];
const colorRules = siteStyles.color_rules ?? [];

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
  document.querySelectorAll<HTMLElement>(selector).forEach((node) => {
    if (node.textContent !== value) node.textContent = value;
  });
}

function cssEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function textSelectors(scope: string, productId = "") {
  const id = productId ? cssEscape(productId) : "";
  const selectedPrefix = id ? `.nume[data-truth-product-id="${id}"] ` : "";
  switch (scope) {
    case "brand": return [".truth-wordmark"];
    case "nav": return [".truth-nav a"];
    case "row_heading": return ['.gallery-row[data-nume-row="row_nume_objects"] .merchant-title'];
    case "row_subheader": return ['.gallery-row[data-nume-row="row_nume_objects"] .family-title'];
    case "card_title":
      return [id ? `.tile[data-product-id="${id}"] .tile-meta b` : '.gallery-row[data-nume-row="row_nume_objects"] .tile-meta b'];
    case "card_price":
      return [id ? `.tile[data-product-id="${id}"] .tile-meta em` : '.gallery-row[data-nume-row="row_nume_objects"] .tile-meta em'];
    case "project_kicker":
      return [`${selectedPrefix}.work-copy p`, `${selectedPrefix}.mobile-rotunda-meta p`];
    case "project_title":
      return [`${selectedPrefix}.work-copy h1`, `${selectedPrefix}.mobile-rotunda-meta h1`, `${selectedPrefix}.preview-page h2`];
    case "project_meta":
      return [`${selectedPrefix}.work-copy > span`, `${selectedPrefix}.mobile-rotunda-meta > span`];
    case "project_description":
      return [`${selectedPrefix}.preview-page p`];
    case "action":
      return [`${selectedPrefix}.hero-action`, `${selectedPrefix}.mobile-hero-action`];
    case "preview_header":
      return [`${selectedPrefix}.preview-bar span`];
    case "preview_source":
      return [`${selectedPrefix}.preview-page > span:not(.demo-checkout)`];
    case "preview_note":
      return [`${selectedPrefix}.demo-checkout`];
    case "footer": return [".truth-footer"];
    case "footer_social": return [".truth-socials"];
    case "section_title": return [".portfolio-section h1", ".resume-intro h1"];
    default: return [];
  }
}

function fontCss(rules: FontRule[]) {
  return rules.flatMap((rule) => {
    const selectors = textSelectors(rule.scope, rule.product_id).filter(Boolean);
    if (!selectors.length || !rule.family) return [];
    const family = rule.family.replace(/'/g, "\\'");
    const fallback = (rule.fallback || "sans-serif").replace(/[;{}]/g, "");
    const weight = /^(?:[1-9]00)$/.test(rule.weight || "") ? rule.weight : "400";
    const style = rule.style === "italic" ? "italic" : "normal";
    return `${selectors.join(",\n")} { font-family: '${family}', ${fallback} !important; font-weight: ${weight} !important; font-style: ${style} !important; }`;
  }).join("\n");
}

function colorCss(rules: ColorRule[]) {
  return rules.flatMap((rule) => {
    const selectors = textSelectors(rule.scope, rule.product_id).filter(Boolean);
    if (!selectors.length || !/^#[0-9a-fA-F]{3,8}$/.test(rule.color)) return [];
    return `${selectors.join(",\n")} { color: ${rule.color} !important; }`;
  }).join("\n");
}

function googleFontHref(family: string, weights: string[]) {
  const normalized = family.trim().replace(/\s+/g, "+");
  const uniqueWeights = [...new Set(weights.filter((w) => /^(?:[1-9]00)$/.test(w)))].sort();
  return `https://fonts.googleapis.com/css2?family=${normalized}${uniqueWeights.length ? `:wght@${uniqueWeights.join(";")}` : ""}&display=swap`;
}

export function TruthChrome() {
  useEffect(() => {
    const fontLinks: HTMLLinkElement[] = [];
    const fontGroups = new Map<string, string[]>();
    for (const rule of fontRules) {
      if (!rule.family) continue;
      const weights = fontGroups.get(rule.family) ?? [];
      weights.push(rule.weight || "400");
      fontGroups.set(rule.family, weights);
    }
    for (const [family, weights] of fontGroups) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = googleFontHref(family, weights);
      link.dataset.truthGoogleFont = family;
      document.head.appendChild(link);
      fontLinks.push(link);
    }

    const style = document.createElement("style");
    style.dataset.truthStyleRules = "true";
    style.textContent = `${fontCss(fontRules)}\n${colorCss(colorRules)}`;
    document.head.appendChild(style);

    const applyTruthCopy = () => {
      const main = document.querySelector<HTMLElement>(".nume");
      const previewing = main?.classList.contains("is-previewing") ?? false;
      const block = selectedBlock();
      if (main) {
        if (block?.product_id) main.dataset.truthProductId = block.product_id;
        else delete main.dataset.truthProductId;
      }
      setText(".hero-action, .mobile-hero-action", `${previewing ? (block?.destination_label || truthData.site.visit_label) : truthData.site.details_label} ↗`);
      setText(".preview-bar span", truthData.site.preview_header);
      const indexText = document.querySelector<HTMLElement>(".hero-index, .mobile-hero-index")?.textContent?.trim() || "";
      document.querySelectorAll<HTMLElement>(".preview-page").forEach((page) => {
        const source = Array.from(page.children).find((child) => child.tagName === "SPAN" && !child.classList.contains("demo-checkout")) as HTMLElement | undefined;
        const nextSource = `${truthData.site.preview_source_prefix} ${indexText}`.trim();
        if (source && source.textContent !== nextSource) source.textContent = nextSource;
      });
      setText(".demo-checkout", truthData.site.preview_note);
    };

    let frame = 0;
    const scheduleTruthCopy = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        applyTruthCopy();
      });
    };

    const observer = new MutationObserver(scheduleTruthCopy);
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
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener("click", redirect, true);
      style.remove();
      fontLinks.forEach((link) => link.remove());
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
