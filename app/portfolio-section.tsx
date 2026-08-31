import type { CSSProperties } from "react";
import truthData from "../data/truth.generated.json";
import { resolveAssetPath } from "../lib/asset-path.mjs";

type TextTag = "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

type TextStyle = {
  tag?: TextTag;
  color?: string;
  size?: number | null;
  font_url?: string;
};

type PageStyle = {
  title?: TextStyle;
  kicker?: TextStyle;
  body?: TextStyle;
};

type PageSection = {
  order: number;
  image_side: "left" | "right";
  image_url: string;
  image_alt: string;
  image_link_url?: string;
  header: string;
  subheader: string;
  body: string;
  header_tag: TextTag;
  subheader_tag: TextTag;
  body_tag: TextTag;
  header_color: string;
  subheader_color: string;
  body_color: string;
  header_font_url: string;
  subheader_font_url: string;
  body_font_url: string;
  header_size?: number | null;
  subheader_size?: number | null;
  body_size?: number | null;
};

type EditablePage = {
  title: string;
  kicker: string;
  body: string;
  email?: string;
  path?: string;
  custom?: boolean;
  style?: PageStyle;
  sections?: PageSection[];
};

function resolvedHref(value: string) {
  if (!value) return "";
  if (/^(?:https?:)?\/\//i.test(value) || /^(?:mailto|tel):/i.test(value)) return value;
  return resolveAssetPath(value);
}

function googleFamily(url: string) {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "fonts.googleapis.com") return undefined;
    const family = parsed.searchParams.get("family")?.split(":")[0]?.replace(/\+/g, " ").trim();
    return family || undefined;
  } catch {
    return undefined;
  }
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
  if (className === "portfolio-section-body") {
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
  return {};
}

function TextElement({
  tag,
  text,
  color,
  fontUrl,
  size,
  className,
}: {
  tag: TextTag;
  text: string;
  color?: string;
  fontUrl?: string;
  size?: number | null;
  className: string;
}) {
  const family = googleFamily(fontUrl || "");
  const defaults = visualDefaults(className);
  const style: CSSProperties = {
    ...defaults,
    color: color || undefined,
    fontFamily: family ? `'${family}', sans-serif` : defaults.fontFamily,
    fontSize: size ? `${size}px` : defaults.fontSize,
  };
  switch (tag) {
    case "h1": return <h1 className={className} style={style}>{text}</h1>;
    case "h2": return <h2 className={className} style={style}>{text}</h2>;
    case "h3": return <h3 className={className} style={style}>{text}</h3>;
    case "h4": return <h4 className={className} style={style}>{text}</h4>;
    case "h5": return <h5 className={className} style={style}>{text}</h5>;
    case "h6": return <h6 className={className} style={style}>{text}</h6>;
    default: return <p className={className} style={style}>{text}</p>;
  }
}

export function PortfolioSection({ section }: { section: string }) {
  const key = section.toLowerCase();
  const pages = truthData.pages as unknown as Record<string, EditablePage>;
  const page = pages[key];
  if (!page) return null;

  const sections: PageSection[] = page.sections ?? [];
  const pageStyle = page.style ?? {};
  const titleStyle = pageStyle.title ?? {};
  const kickerStyle = pageStyle.kicker ?? {};
  const bodyStyle = pageStyle.body ?? {};

  const fontUrls: string[] = [...new Set(
    [
      titleStyle.font_url,
      kickerStyle.font_url,
      bodyStyle.font_url,
      ...sections.flatMap((item: PageSection) => [item.header_font_url, item.subheader_font_url, item.body_font_url]),
    ].filter((href): href is string => Boolean(href)),
  )];

  return (
    <main className={`portfolio-section portfolio-section-${key}`}>
      {fontUrls.map((href) => <link key={href} rel="stylesheet" href={href} />)}
      <div className="portfolio-section-copy">
        <TextElement
          tag={kickerStyle.tag || "p"}
          text={page.kicker}
          color={kickerStyle.color}
          fontUrl={kickerStyle.font_url}
          size={kickerStyle.size}
          className="portfolio-section-kicker"
        />
        <TextElement
          tag={titleStyle.tag || "h1"}
          text={page.title}
          color={titleStyle.color}
          fontUrl={titleStyle.font_url}
          size={titleStyle.size}
          className="portfolio-section-title"
        />
        <div className="portfolio-section-rule" aria-hidden="true" />
        <TextElement
          tag={bodyStyle.tag || "p"}
          text={page.body}
          color={bodyStyle.color}
          fontUrl={bodyStyle.font_url}
          size={bodyStyle.size}
          className="portfolio-section-body"
        />
        {page.email ? (
          <a className="portfolio-section-link" href={`mailto:${page.email}`}>{page.email}</a>
        ) : null}
      </div>

      {sections.length ? (
        <div className="portfolio-builder-sections" aria-label={`${page.title} content`}>
          {sections.map((item: PageSection) => (
            <section key={`${key}-${item.order}`} className={`portfolio-builder-section image-${item.image_side}`}>
              <div className="portfolio-builder-image">
                {item.image_link_url ? (
                  <a
                    className="portfolio-builder-image-link"
                    href={resolvedHref(item.image_link_url)}
                    aria-label={`Open ${item.header || "project"}`}
                  >
                    {item.image_url ? <img src={item.image_url} alt={item.image_alt || ""} /> : <div className="portfolio-builder-image-placeholder">IMAGE</div>}
                  </a>
                ) : item.image_url ? (
                  <img src={item.image_url} alt={item.image_alt || ""} />
                ) : (
                  <div className="portfolio-builder-image-placeholder">IMAGE</div>
                )}
              </div>
              <div className="portfolio-builder-copy">
                {item.header ? <TextElement tag={item.header_tag || "h2"} text={item.header} color={item.header_color} fontUrl={item.header_font_url} size={item.header_size} className="portfolio-builder-header" /> : null}
                {item.subheader ? <TextElement tag={item.subheader_tag || "h3"} text={item.subheader} color={item.subheader_color} fontUrl={item.subheader_font_url} size={item.subheader_size} className="portfolio-builder-subheader" /> : null}
                {item.body ? <TextElement tag={item.body_tag || "p"} text={item.body} color={item.body_color} fontUrl={item.body_font_url} size={item.body_size} className="portfolio-builder-body" /> : null}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </main>
  );
}
