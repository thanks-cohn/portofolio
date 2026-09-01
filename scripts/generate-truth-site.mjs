import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const truthCsvPath = path.join(root, "truth.csv");
const csvText = await readFile(truthCsvPath, "utf8");

// q-fonts rows are internal metadata for the newer Q typography layer. The
// legacy generator treats every page_text product_id as a real page and throws
// on q-fonts, which prevents unrelated image/text publishes from deploying.
// Hide those rows only while the legacy/release chain runs, then immediately
// restore the complete CSV before applying the modern typography post-process.
const legacyCsvText = csvText
  .split(/\r?\n/)
  .filter((line) => !line.startsWith("page_text,q-fonts,"))
  .join("\n");
const hidTypographyRows = legacyCsvText !== csvText;
if (hidTypographyRows) await writeFile(truthCsvPath, legacyCsvText, "utf8");
try {
  await import("./generate-truth-release.mjs");
} finally {
  if (hidTypographyRows) await writeFile(truthCsvPath, csvText, "utf8");
}

const truthPath = path.join(root, "data", "truth.generated.json");
const seedPath = path.join(root, "data", "portfolio-seed.json");
const truth = JSON.parse(await readFile(truthPath, "utf8"));
const seed = JSON.parse(await readFile(seedPath, "utf8"));

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
    byOrder.set(order, normalizedSection({
      ...seeded,
      ...current,
      image_link_url: String(current.image_link_url || "").trim() || String(seeded.image_link_url || "").trim(),
    }));
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

truth.schema_version = "1.15.2";
await writeFile(truthPath, `${JSON.stringify(truth, null, 2)}\n`, "utf8");
console.log("Preserved project redirects, isolated legacy generation from Q metadata, matched PROPS typography, and applied persistent typography assignments.");
