import type { HTMLAttributes } from "react";
import truthData from "../data/truth.generated.json";
import { resolveAssetPath } from "../lib/asset-path.mjs";

type PageSection = {
  order: number;
  image_url: string;
  image_alt?: string;
};

type EditablePage = {
  title: string;
  kicker: string;
  body: string;
  sections?: PageSection[];
};

function qAttrs(order: number, value: string): HTMLAttributes<HTMLElement> & Record<string, string> {
  return {
    "data-q-edit": "image",
    "data-q-record": "page_section",
    "data-q-field": "image_url",
    "data-q-order": String(order),
    "data-q-value": value,
  };
}

function resolvedSrc(value: string) {
  if (!value) return "";
  if (/^(?:https?:)?\/\//i.test(value)) return value;
  return resolveAssetPath(value);
}

export function PropsGalleryProject({ section }: { section: string }) {
  const key = section.toLowerCase();
  const page = (truthData.pages as unknown as Record<string, EditablePage>)[key];
  if (!page) return null;

  const images = (page.sections || [])
    .filter((item) => item.image_url)
    .sort((a, b) => Number(a.order) - Number(b.order))
    .slice(0, 8);

  return (
    <main className={`portfolio-section props-gallery-project portfolio-section-${key}`}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500&display=swap"
      />

      <header className="props-gallery-intro">
        <p className="props-gallery-kicker">{page.kicker}</p>
        <h1 className="props-gallery-title">{page.title}</h1>
        <div className="props-gallery-rule" aria-hidden="true" />
        <p className="props-gallery-body">{page.body}</p>
      </header>

      <div className="props-gallery-images" aria-label={`${page.title} image gallery`}>
        {images.map((item) => (
          <figure key={`${key}-${item.order}`} className="props-gallery-image">
            <img
              src={resolvedSrc(item.image_url)}
              alt={item.image_alt || `${page.title} project image ${item.order}`}
              {...qAttrs(item.order, item.image_url)}
              data-q-product={key}
            />
          </figure>
        ))}
      </div>
    </main>
  );
}
