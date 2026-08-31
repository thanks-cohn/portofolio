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

type SocialLink = {
  platform: "facebook" | "instagram" | "twitter" | string;
  label: string;
  url: string;
};

type TopicBlock = {
  product_id: string;
  destination_label?: string;
  destination_url?: string;
  section?: string;
  location?: string;
};

const siteStyles = truthData.site as unknown as {
  font_rules?: FontRule[];
  color_rules?: ColorRule[];
  socials?: SocialLink[];
};
const fontRules = siteStyles.font_rules ?? [];
const colorRules = siteStyles.color_rules ?? [];
const socialLinks = siteStyles.socials ?? [];

function resolvedHref(value: string) {
  if (!value) return "";
  if (/^(?:https?:)?\/\//i.test(value) || /^(?:mailto|tel):/i.test(value)) return value;
  return resolveAssetPath(value);
}

const socialSvgProps = {
  width: 15,
  height: 15,
  style: { width: "15px", height: "15px", maxWidth: "15px", maxHeight: "15px", display: "block", flex: "0 0 15px" },
} as const;

function SocialIcon({ platform }: { platform: string }) {
  const key = platform.toLowerCase();
  if (key === "facebook") {
    return <svg {...socialSvgProps} viewBox="0 0 24 24" aria-hidden="true"><path d="M14.2 8.2h2.6V4.4c-.45-.06-1.98-.2-3.8-.2-3.75 0-6.32 2.29-6.32 6.5v3.63H2.5v4.25h4.18V24h5.13v-5.42h4.28l.68-4.25h-4.96v-3.2c0-1.23.34-2.93 2.39-2.93Z" fill="currentColor"/></svg>;
  }
  if (key === "instagram") {
    return <svg {...socialSvgProps} viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.8"/><circle cx="17.4" cy="6.7" r="1.1" fill="currentColor"/></svg>;
  }
  return <svg {...socialSvgProps} viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 4.5 19.5 19.5M19.5 4.5 4.5 19.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
}

function SocialLinks({ className }: { className: string }) {
  if (!socialLinks.length) return null;
  return (
    <span className={className}>
      {socialLinks.map((social) => (
        <a
          key={`${social.platform}:${social.url}`}
          href={resolvedHref(social.url)}
          aria-label={social.label || social.platform}
          target="_blank"
          rel="noreferrer"
        >
          <SocialIcon platform={social.platform} />
        </a>
      ))}
    </span>
  );
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

function blockMeta(block: TopicBlock | null) {
  if (!block) return "";
  return [block.section?.trim(), block.location?.trim()].filter(Boolean).join(" · ");
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
    case "footer_social": return [".truth-socials", ".truth-header-socials"];
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
      const block = selectedBlock() as unknown as TopicBlock | null;
      if (main) {
        if (block?.product_id) main.dataset.truthProductId = block.product_id;
        else delete main.dataset.truthProductId;
      }

      for (const rawBlock of truthData.blocks) {
        const topic = rawBlock as unknown as TopicBlock;
        const value = blockMeta(topic);
        const selector = `.tile[data-product-id="${cssEscape(topic.product_id)}"] .tile-meta em`;
        document.querySelectorAll<HTMLElement>(selector).forEach((node) => {
          if (node.textContent !== value) node.textContent = value;
        });
      }
      setText(".work-copy > span, .mobile-rotunda-meta > span", blockMeta(block));

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
      const block = selectedBlock() as unknown as TopicBlock | null;
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
        <SocialLinks className="truth-header-socials" />
      </div>

      <footer className="truth-footer">
        <span>{truthData.site.footer_left}</span>
        <SocialLinks className="truth-socials" />
      </footer>
    </>
  );
}
