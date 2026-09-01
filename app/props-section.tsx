import type { CSSProperties, HTMLAttributes } from "react";
import truthData from "../data/truth.generated.json";
import { resolveAssetPath } from "../lib/asset-path.mjs";

type TextTag = "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

type TextStyle = {
  tag?: TextTag;
  color?: string;
  size?: number | null;
  font_url?: string;
};

type EditablePage = {
  title: string;
  kicker: string;
  body: string;
  style?: {
    title?: TextStyle;
    kicker?: TextStyle;
    body?: TextStyle;
  };
};

type PortfolioBlock = {
  product_id: string;
  order: number;
  title: string;
  image_url: string;
  image_alt: string;
};

type QMeta = {
  record: "block" | "page_text";
  product: string;
  field: string;
  order?: number;
  kind?: "text" | "image";
  value?: string;
};

const PROPS_PROJECT_ROUTES = [
  "/project-a/",
  "/project-b/",
  "/project-e/",
  "/project-f/",
  "/project-g/",
  "/project-h/",
  "/project-i/",
  "/project-j/",
];

function qAttrs(meta?: QMeta): HTMLAttributes<HTMLElement> & Record<string, string | number | undefined> {
  if (!meta) return {};
  return {
    "data-q-edit": meta.kind || "text",
    "data-q-record": meta.record,
    "data-q-product": meta.product,
    "data-q-field": meta.field,
    "data-q-order": meta.order === undefined ? undefined : String(meta.order),
    "data-q-value": meta.value,
  };
}

function googleFamily(url: string) {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "fonts.googleapis.com") return undefined;
    return parsed.searchParams.get("family")?.split(":")[0]?.replace(/\+/g, " ").trim() || undefined;
  } catch {
    return undefined;
  }
}

function resolvedHref(value: string) {
  if (!value) return "";
  if (/^(?:https?:)?\/\//i.test(value) || /^(?:mailto|tel):/i.test(value)) return value;
  return resolveAssetPath(value);
}

function visualDefaults(className: string): CSSProperties {
  if (className === "portfolio-section-title") {
    return {
      margin: 0,
      fontFamily: "Georgia, serif",
      fontSize: "clamp(46px, 7vw, 92px)",
      fontWeight: 400,
      lineHeight: 0.95,
      letterSpacing: "-.025em",
      textAlign: "center",
    };
  }
  if (className === "portfolio-section-kicker") {
    return {
      margin: "0 0 18px",
      fontFamily: "Arial, Helvetica, sans-serif",
      fontSize: "9px",
      fontWeight: 400,
      lineHeight: 1.4,
      letterSpacing: ".2em",
      textTransform: "uppercase",
      textAlign: "center",
    };
  }
  return {
    maxWidth: "58ch",
    margin: "0 auto",
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: "14px",
    fontWeight: 400,
    lineHeight: 1.75,
    textAlign: "center",
  };
}

function TextElement({
  tag,
  text,
  color,
  fontUrl,
  size,
  className,
  q,
}: {
  tag: TextTag;
  text: string;
  color?: string;
  fontUrl?: string;
  size?: number | null;
  className: string;
  q?: QMeta;
}) {
  const family = googleFamily(fontUrl || "");
  const defaults = visualDefaults(className);
  const style: CSSProperties = {
    ...defaults,
    color: color || undefined,
    fontFamily: family ? `'${family}', sans-serif` : defaults.fontFamily,
    fontSize: size ? `${size}px` : defaults.fontSize,
  };
  const attrs = qAttrs(q);

  switch (tag) {
    case "h1": return <h1 className={className} style={style} {...attrs}>{text}</h1>;
    case "h2": return <h2 className={className} style={style} {...attrs}>{text}</h2>;
    case "h3": return <h3 className={className} style={style} {...attrs}>{text}</h3>;
    case "h4": return <h4 className={className} style={style} {...attrs}>{text}</h4>;
    case "h5": return <h5 className={className} style={style} {...attrs}>{text}</h5>;
    case "h6": return <h6 className={className} style={style} {...attrs}>{text}</h6>;
    default: return <p className={className} style={style} {...attrs}>{text}</p>;
  }
}

export function PropsSection() {
  const page = (truthData.pages as unknown as Record<string, EditablePage>).acting;
  if (!page) return null;

  const pageStyle = page.style ?? {};
  const titleStyle = pageStyle.title ?? {};
  const kickerStyle = pageStyle.kicker ?? {};
  const bodyStyle = pageStyle.body ?? {};
  const cards = (truthData.blocks as unknown as PortfolioBlock[])
    .filter((item) => Number(item.order) >= 1 && Number(item.order) <= 8)
    .sort((a, b) => Number(a.order) - Number(b.order));

  const fontUrls = [...new Set([
    titleStyle.font_url,
    kickerStyle.font_url,
    bodyStyle.font_url,
  ].filter((href): href is string => Boolean(href)))];

  return (
    <main className="portfolio-section portfolio-section-acting">
      {fontUrls.map((href) => <link key={href} rel="stylesheet" href={href} />)}

      <div className="portfolio-section-copy">
        <TextElement
          tag={kickerStyle.tag || "p"}
          text={page.kicker}
          color={kickerStyle.color}
          fontUrl={kickerStyle.font_url}
          size={kickerStyle.size}
          className="portfolio-section-kicker"
          q={{ record: "page_text", product: "acting", field: "kicker" }}
        />
        <TextElement
          tag={titleStyle.tag || "h1"}
          text={page.title}
          color={titleStyle.color}
          fontUrl={titleStyle.font_url}
          size={titleStyle.size}
          className="portfolio-section-title"
          q={{ record: "page_text", product: "acting", field: "title" }}
        />
        <div className="portfolio-section-rule" aria-hidden="true" />
        <TextElement
          tag={bodyStyle.tag || "p"}
          text={page.body}
          color={bodyStyle.color}
          fontUrl={bodyStyle.font_url}
          size={bodyStyle.size}
          className="portfolio-section-body"
          q={{ record: "page_text", product: "acting", field: "body" }}
        />
      </div>

      <div className="props-project-grid props-project-grid-eight" aria-label="PROPS projects">
        {cards.map((item, index) => {
          const href = PROPS_PROJECT_ROUTES[index] || "";
          return (
            <a
              key={item.product_id || item.order}
              className="props-project-card"
              href={resolvedHref(href)}
              aria-label={`Open ${item.title || `project ${index + 1}`}`}
            >
              <span className="props-project-card-image">
                <img
                  src={item.image_url}
                  alt={item.image_alt || item.title || "Project image"}
                  {...qAttrs({
                    record: "block",
                    product: item.product_id,
                    order: item.order,
                    field: "image_url",
                    kind: "image",
                    value: item.image_url,
                  })}
                />
              </span>
              <h2
                className="props-project-card-title"
                {...qAttrs({
                  record: "block",
                  product: item.product_id,
                  order: item.order,
                  field: "title",
                })}
              >
                {item.title}
              </h2>
            </a>
          );
        })}
      </div>
    </main>
  );
}
