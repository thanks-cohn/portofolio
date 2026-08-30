import truthData from "../data/truth.generated.json";

type SectionKey = "ACTING" | "DESIGN" | "CONTACT";
type TextTag = "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

type PageSection = {
  order: number;
  image_side: "left" | "right";
  image_url: string;
  image_alt: string;
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
};

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

function TextElement({ tag, text, color, fontUrl, className }: { tag: TextTag; text: string; color?: string; fontUrl?: string; className: string }) {
  const style = { color: color || undefined, fontFamily: googleFamily(fontUrl || "") ? `'${googleFamily(fontUrl || "")}', sans-serif` : undefined };
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

export function PortfolioSection({ section }: { section: SectionKey }) {
  const key = section.toLowerCase() as "acting" | "design" | "contact";
  const page = truthData.pages[key] as typeof truthData.pages[typeof key] & { sections?: PageSection[] };
  const sections = page.sections ?? [];
  const fontUrls = [...new Set(sections.flatMap((item) => [item.header_font_url, item.subheader_font_url, item.body_font_url]).filter(Boolean))];

  return (
    <main className={`portfolio-section portfolio-section-${key}`}>
      {fontUrls.map((href) => <link key={href} rel="stylesheet" href={href} />)}
      <div className="portfolio-section-copy">
        <p>{page.kicker}</p>
        <h1>{page.title}</h1>
        <div className="portfolio-section-rule" aria-hidden="true" />
        <p className="portfolio-section-body">{page.body}</p>
        {"email" in page && page.email ? (
          <a className="portfolio-section-link" href={`mailto:${page.email}`}>{page.email}</a>
        ) : null}
      </div>

      {sections.length ? (
        <div className="portfolio-builder-sections" aria-label={`${page.title} content`}>
          {sections.map((item) => (
            <section key={`${key}-${item.order}`} className={`portfolio-builder-section image-${item.image_side}`}>
              <div className="portfolio-builder-image">
                {item.image_url ? <img src={item.image_url} alt={item.image_alt || ""} /> : <div className="portfolio-builder-image-placeholder">IMAGE</div>}
              </div>
              <div className="portfolio-builder-copy">
                {item.header ? <TextElement tag={item.header_tag || "h2"} text={item.header} color={item.header_color} fontUrl={item.header_font_url} className="portfolio-builder-header" /> : null}
                {item.subheader ? <TextElement tag={item.subheader_tag || "h3"} text={item.subheader} color={item.subheader_color} fontUrl={item.subheader_font_url} className="portfolio-builder-subheader" /> : null}
                {item.body ? <TextElement tag={item.body_tag || "p"} text={item.body} color={item.body_color} fontUrl={item.body_font_url} className="portfolio-builder-body" /> : null}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </main>
  );
}