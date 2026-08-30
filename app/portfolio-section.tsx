import truthData from "../data/truth.generated.json";

type SectionKey = "ACTING" | "DESIGN" | "CONTACT";

export function PortfolioSection({ section }: { section: SectionKey }) {
  const key = section.toLowerCase() as "acting" | "design" | "contact";
  const page = truthData.pages[key];

  return (
    <main className="portfolio-section">
      <div className="portfolio-section-copy">
        <p>{page.kicker}</p>
        <h1>{page.title}</h1>
        <div className="portfolio-section-rule" aria-hidden="true" />
        <p className="portfolio-section-body">{page.body}</p>
        {"email" in page && page.email ? (
          <a className="portfolio-section-link" href={`mailto:${page.email}`}>{page.email}</a>
        ) : null}
      </div>
    </main>
  );
}
