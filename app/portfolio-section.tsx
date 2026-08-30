import truthData from "../data/truth.generated.json";

type SectionKey = "ACTING" | "DESIGN" | "RESUME" | "CONTACT";

export function PortfolioSection({ section }: { section: SectionKey }) {
  const item = truthData.site.header_nav.find((entry) => entry.label === section);
  return (
    <main className="portfolio-section">
      <h1>{item?.label ?? section}</h1>
    </main>
  );
}
