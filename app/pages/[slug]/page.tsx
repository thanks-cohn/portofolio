import truthData from "../../../data/truth.generated.json";
import { PortfolioSection } from "../../portfolio-section";

type PageRecord = { custom?: boolean; path?: string };
const pages = truthData.pages as unknown as Record<string, PageRecord>;

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.entries(pages)
    .filter(([, page]) => page.custom)
    .map(([slug]) => ({ slug }));
}

export default async function CustomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PortfolioSection section={slug} />;
}
