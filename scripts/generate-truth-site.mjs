import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const truthCsvPath = path.join(root, "truth.csv");
const csvText = await readFile(truthCsvPath, "utf8");

// q-fonts and the hidden PROPS case-study rows belong to the newer Q/site
// layers. The oldest generator only understands the fixed historical pages.
// Filter complete CSV records rather than physical lines because font payloads
// can contain newlines. Everything is restored immediately after the legacy
// chain finishes, so truth.csv itself remains the complete source of truth.
const MODERN_PROJECT_KEYS = new Set(["project-a", "project-b", "project-e", "project-f"]);
const csvRowsForLegacy = parseCsv(csvText);
const csvHeader = csvRowsForLegacy.length ? Object.keys(csvRowsForLegacy[0]) : [];
const legacyRows = csvRowsForLegacy.filter((row) => {
  const record = String(row.record_type || "").trim();
  const product = String(row.product_id || "").trim();
  const isQTypography = record === "page_text" && product === "q-fonts";
  const isModernProjectRow = ["page_text", "page_style", "page_section"].includes(record)
    && MODERN_PROJECT_KEYS.has(product);
  return !isQTypography && !isModernProjectRow;
});
const legacyCsvText = csvHeader.length ? serializeCsv(legacyRows, csvHeader) : csvText;
const hidLegacyRows = legacyRows.length !== csvRowsForLegacy.length;
if (hidLegacyRows) await writeFile(truthCsvPath, legacyCsvText, "utf8");
try {
  await import("./generate-truth-release.mjs");
} finally {
  if (hidLegacyRows) await writeFile(truthCsvPath, csvText, "utf8");
}

const truthPath = path.join(root, "data", "truth.generated.json");
const seedPath = path.join(root, "data", "portfolio-seed.json");
const propsPlaceholderPath = path.join(root, "data", "props-project-placeholders.json");
const truth = JSON.parse(await readFile(truthPath, "utf8"));
const seed = JSON.parse(await readFile(seedPath, "utf8"));
const propsPlaceholders = JSON.parse(await readFile(propsPlaceholderPath, "utf8"));

const BASIC_FONT_PRESETS = {
  times: {
    family: "Times New Roman",
    cssFamily: "'Times New Roman', Times, serif",
  },
  calibri: {
    family: "Calibri",
    cssFamily: "Calibri, 'Segoe UI', Arial, sans-serif",
  },
  arial: {
    family: "Arial",
    cssFamily: "Arial, Helvetica, sans-serif",
  },
  helvetica: {
    family: "Helvetica",
    cssFamily: "Helvetica, Arial, sans-serif",
  },
  georgia: {
    family: "Georgia",
    cssFamily: "Georgia, 'Times New Roman', serif",
  },
  verdana: {
    family: "Verdana",
    cssFamily: "Verdana, Geneva, sans-serif",
  },
  garamond: {
    family: "Garamond",
    cssFamily: "Garamond, Georgia, serif",
  },
  courier: {
    family: "Courier New",
    cssFamily: "'Courier New', Courier, monospace",
  },
  roboto: {
    family: "Roboto",
    cssFamily: "Roboto, Arial, sans-serif",
    href: "https://fonts.googleapis.com/css2?family=Roboto:wght@100..900&display=swap",
  },
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  const [header, ...body] = rows.filter((item) => item.some((value) => value !== ""));
  if (!header) return [];
  return body.map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""])));
}

function serializeCsv(rows, header) {
  const escape = (value) => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `${header.map(escape).join(",")}\n${rows.map((row) => header.map((key) => escape(row[key])).join(",")).join("\n")}\n`;
}

function normalizeFontInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  let href = "";
  const linkMatch = raw.match(/href\s*=\s*["'](https:\/\/fonts\.googleapis\.com\/[^"']+)["']/i);
  if (linkMatch) href = linkMatch[1].replace(/&amp;/g, "&");
  else {
    const urlMatch = raw.match(/https:\/\/fonts\.googleapis\.com\/[^\s"'<>]+/i);
    if (urlMatch) href = urlMatch[0].replace(/&amp;/g, "&");
  }
  if (!href) return null;
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" || url.hostname !== "fonts.googleapis.com") return null;
    const familySpecs = url.searchParams.getAll("family");
    const families = familySpecs
      .map((item) => item.split(":")[0].replace(/\+/g, " ").trim())
      .filter(Boolean);
    if (!families.length) return null;
    return { href, family: families[0], families, raw };
  } catch {
    return null;
  }
}

function fontFromPreset(value) {
  const key = String(value || "").trim();
  const preset = BASIC_FONT_PRESETS[key];
  if (!preset) return null;
  return {
    href: preset.href || "",
    family: preset.family,
    families: [preset.family],
    raw: preset.href || "",
    preset: key,
    cssFamily: preset.cssFamily,
  };
}

function decodePart(value) {
  try { return decodeURIComponent(value || ""); } catch { return value || ""; }
}

function parseFontTarget(value) {
  const parts = String(value || "").split("::");
  if (parts.length !== 5 || parts[0] !== "font") return null;
  const [, record, product, order, field] = parts.map(decodePart);
  if (!record || !field) return null;
  return { record, product, order, field };
}

function normalizeTypography(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    const payload = JSON.parse(raw);
    if (payload?.revert) return { revert: true };

    const style = {};
    if (payload?.fontPreset) {
      const font = fontFromPreset(payload.fontPreset);
      if (font) style.font = font;
    } else if (payload?.fontInput) {
      const font = normalizeFontInput(payload.fontInput);
      if (font) {
        const family = payload.fontFamily && font.families.includes(payload.fontFamily)
          ? payload.fontFamily
          : font.family;
        style.font = { ...font, family };
      }
    }

    if (payload?.color?.mode === "solid" && payload.color.value) {
      style.color = { mode: "solid", value: String(payload.color.value) };
    } else if (payload?.color?.mode === "gradient" && payload.color.start && payload.color.end) {
      style.color = {
        mode: "gradient",
        start: String(payload.color.start),
        end: String(payload.color.end),
        angle: Number.isFinite(Number(payload.color.angle)) ? Number(payload.color.angle) : 90,
      };
    }

    if (payload?.size && ["h1", "h2", "h3", "custom"].includes(payload.size.mode)) {
      if (payload.size.mode === "custom") {
        const px = Number(payload.size.px);
        if (Number.isFinite(px) && px > 0) style.size = { mode: "custom", px };
      } else {
        style.size = { mode: payload.size.mode };
      }
    }

    return Object.keys(style).length ? { style } : null;
  } catch {
    const font = normalizeFontInput(raw);
    return font ? { style: { font } } : null;
  }
}

function normalizedSection(item) {
  return {
    ...item,
    header_size: Number(item.header_size) || null,
    subheader_size: Number(item.subheader_size) || null,
    body_size: Number(item.body_size) || null,
  };
}

function csvTextValue(rows, field, fallback = "") {
  const row = rows.find((item) => String(item.title || "").trim() === field);
  return row ? String(row.description ?? "") : fallback;
}

function csvSection(row, fallback = {}) {
  return normalizedSection({
    ...fallback,
    order: Number(row.order) || Number(fallback.order) || 1,
    image_side: ["left", "right"].includes(String(row.availability || "").toLowerCase())
      ? String(row.availability).toLowerCase()
      : (fallback.image_side || "left"),
    image_url: row.image_url || "",
    image_alt: row.image_alt || "",
    image_caption: row.image_caption || "",
    image_link_url: row.section_link_url || "",
    header: row.title || "",
    subheader: row.destination_label || "",
    body: row.description || "",
    header_tag: row.font_scope || fallback.header_tag || "h2",
    subheader_tag: row.font_product_id || fallback.subheader_tag || "h3",
    body_tag: row.color_scope || fallback.body_tag || "p",
    header_color: row.text_color || "",
    subheader_color: row.color_product_id || "",
    body_color: row.footer_icon_ref || "",
    header_font_url: row.destination_url || "",
    subheader_font_url: row.footer_icon_label || "",
    body_font_url: row.footer_icon_url || "",
    header_size: row.header_size || null,
    subheader_size: row.subheader_size || null,
    body_size: row.body_size || null,
  });
}

function applyCsvPageStyle(page, pageKey) {
  const rows = csvRowsForLegacy.filter((row) =>
    row.record_type === "page_style" && String(row.product_id || "").trim() === pageKey,
  );
  page.style ||= {};
  for (const row of rows) {
    const match = /^(title|kicker|body)_(tag|color|size|font_url)$/.exec(String(row.title || "").trim());
    if (!match) continue;
    const [, target, property] = match;
    page.style[target] ||= {};
    const value = String(row.description ?? "");
    page.style[target][property === "font_url" ? "font_url" : property] = property === "size"
      ? (Number(value) || null)
      : value;
  }
}

function mergeSeedSections(page, seedSections) {
  if (!page) return;
  const existing = Array.isArray(page.sections) ? page.sections : [];
  const byOrder = new Map(
    existing
      .filter((item) => Number.isInteger(Number(item?.order)) && Number(item.order) > 0)
      .map((item) => [Number(item.order), item]),
  );

  for (const item of seedSections || []) {
    const order = Number(item?.order);
    if (!Number.isInteger(order) || order < 1) continue;
    const seeded = normalizedSection(item);
    const current = byOrder.get(order);
    if (!current) {
      byOrder.set(order, seeded);
      continue;
    }
    // Existing CSV-derived values win even when intentionally blank. Falling
    // back on emptiness made it impossible for Q to clear a link or caption.
    byOrder.set(order, normalizedSection({ ...seeded, ...current }));
  }

  page.sections = [...byOrder.values()].sort((a, b) => Number(a.order) - Number(b.order));
}

if (truth.pages?.acting && seed.props) {
  mergeSeedSections(truth.pages.acting, seed.props.sections || []);
}
if (truth.pages?.design && seed.design) {
  mergeSeedSections(truth.pages.design, seed.design.sections || []);
}

for (const item of seed.hidden_pages || []) {
  const key = String(item.key || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  const page = truth.pages?.[key];
  if (!key || !page) continue;
  mergeSeedSections(page, item.sections || []);
}

// PROPS itself remains untouched above the fold. Its lower area is rendered as
// a four-card gallery directly from the first four portfolio blocks. Each card
// opens one hidden case-study page. The case-study title follows the card title,
// so editing the portfolio title automatically keeps the deeper page in sync.
const propsRouteOrder = {
  "project-a": 1,
  "project-b": 2,
  "project-e": 3,
  "project-f": 4,
};

const omittedPropsSections = {
  "project-f": new Set([4, 8]),
};

truth.pages ||= {};
for (const [pageKey, placeholder] of Object.entries(propsPlaceholders.pages || {})) {
  let page = truth.pages[pageKey];
  if (!page) {
    page = truth.pages[pageKey] = {
      title: "",
      kicker: "",
      body: "",
      path: `/${pageKey}/`,
      custom: true,
      style: {},
      sections: [],
    };
  }

  const cardOrder = propsRouteOrder[pageKey];
  const matchingBlock = (truth.blocks || []).find((item) => Number(item.order) === cardOrder);
  const textRows = csvRowsForLegacy.filter((row) =>
    row.record_type === "page_text" && String(row.product_id || "").trim() === pageKey,
  );
  page.title = csvTextValue(textRows, "title", String(matchingBlock?.title || placeholder.title || page.title || ""));
  page.kicker = csvTextValue(textRows, "kicker", String(placeholder.kicker || page.kicker || ""));
  page.body = csvTextValue(textRows, "body", String(placeholder.body || page.body || ""));
  page.style = structuredClone(placeholder.style || page.style || {});
  applyCsvPageStyle(page, pageKey);

  const defaults = (placeholder.sections || []).map(normalizedSection);
  const byOrder = new Map(defaults.map((item) => [Number(item.order), item]));
  const sectionRows = csvRowsForLegacy.filter((row) =>
    row.record_type === "page_section" && String(row.product_id || "").trim() === pageKey,
  );
  for (const row of sectionRows) {
    const order = Number(row.order);
    if (!Number.isInteger(order) || order < 1) continue;
    byOrder.set(order, csvSection(row, byOrder.get(order) || { order }));
  }
  const omittedOrders = omittedPropsSections[pageKey] || new Set();
  page.sections = [...byOrder.values()]
    .filter((item) => !omittedOrders.has(Number(item.order)))
    .sort((a, b) => Number(a.order) - Number(b.order));
}

function internalRouteSegments(value) {
  const raw = String(value || "").trim();
  if (!raw || /^(?:https?:)?\/\//i.test(raw) || /^(?:mailto|tel):/i.test(raw) || raw.startsWith("#")) return [];
  return raw
    .split(/[?#]/, 1)[0]
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map((segment) => segment.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean);
}

async function writeProjectRoute(segments, pageKey) {
  if (!segments.length) return;
  const dir = path.join(root, "app", ...segments);
  await mkdir(dir, { recursive: true });
  const importPath = path.relative(dir, path.join(root, "app", "portfolio-section")).replaceAll(path.sep, "/");
  const rel = importPath.startsWith(".") ? importPath : `./${importPath}`;
  await writeFile(
    path.join(dir, "page.tsx"),
    `import { PortfolioSection } from ${JSON.stringify(rel)};\n\nexport default function ProjectPage() {\n  return <PortfolioSection section=${JSON.stringify(pageKey)} />;\n}\n`,
    "utf8",
  );
}

// Ensure all four hidden PROPS destinations exist as static routes before the
// Next build begins. A Q-edited internal destination also becomes a generated
// alias, so changing a card URL cannot create a dead link.
for (const pageKey of Object.keys(propsPlaceholders.pages || {})) {
  await writeProjectRoute([pageKey], pageKey);
  const cardOrder = propsRouteOrder[pageKey];
  const matchingBlock = (truth.blocks || []).find((item) => Number(item.order) === cardOrder);
  const editedSegments = internalRouteSegments(matchingBlock?.destination_url);
  if (editedSegments.join("/") !== pageKey) await writeProjectRoute(editedSegments, pageKey);
}

const typographyRows = parseCsv(csvText)
  .filter((row) => row.record_type === "page_text" && String(row.product_id || "").trim() === "q-fonts")
  .map((row) => {
    const target = parseFontTarget(row.title);
    const normalized = normalizeTypography(row.description);
    return target && normalized ? { target, ...normalized } : null;
  })
  .filter(Boolean);

// A short-lived Q edit accidentally put Arial 20px on the second PROPS row's
// subheader and body. Both PROPS rows already share the intended base treatment
// (Cormorant Garamond subheader + DM Sans paragraph), so discard only that exact
// accidental override. Any future deliberate Q style on these targets still works.
const effectiveTypographyRows = typographyRows.filter((item) => {
  const target = item?.target || {};
  const style = item?.style || {};
  const isSecondPropsCopy = target.record === "page_section"
    && target.product === "acting"
    && String(target.order) === "2"
    && ["destination_label", "description"].includes(target.field);
  const isAccidentalArial20 = style.font?.preset === "arial"
    && style.size?.mode === "custom"
    && Number(style.size?.px) === 20;
  return !(isSecondPropsCopy && isAccidentalArial20);
});

truth.q_typography = effectiveTypographyRows
  .filter((item) => !item.revert && item.style)
  .map((item) => ({ target: item.target, style: item.style }));

truth.q_fonts = truth.q_typography
  .filter((item) => item.style?.font)
  .map((item) => ({ target: item.target, font: item.style.font }));

truth.site ||= {};
truth.site.socials = (truth.site.socials || []).filter((item) =>
  ["facebook", "instagram"].includes(String(item.platform || "").trim().toLowerCase()),
);

truth.schema_version = "1.17.2";
await writeFile(truthPath, `${JSON.stringify(truth, null, 2)}\n`, "utf8");
console.log("Preserved project redirects, shielded modern Q/project rows from the legacy generator, kept the PROPS intro intact, generated four hidden case studies, and applied persistent typography assignments.");
