import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = (p) => readFile(path.join(root, p), "utf8");
const readJson = async (p) => JSON.parse(await readText(p));
const writeJson = (p, value) => writeFile(path.join(root, p), `${JSON.stringify(value, null, 2)}\n`);

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
    else if (ch === ',') { row.push(field); field = ""; }
    else if (ch === '\n') { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.some((v) => v !== ""));
  if (!header) throw new Error("truth.csv is empty");
  return body
    .map((values) => Object.fromEntries(header.map((key, i) => [key, values[i] ?? ""])))
    .map((r, i) => ({ ...r, __line: i + 2 }));
}

const allRows = parseCsv(await readText("truth.csv"));
const rows = allRows.filter((r) => !r.record_type || r.record_type === "block");
const fontRows = allRows.filter((r) => r.record_type === "font_rule");
if (rows.length !== 10) throw new Error(`truth.csv must contain exactly 10 block rows; found ${rows.length}`);

const ids = rows.map((r) => r.product_id);
if (new Set(ids).size !== ids.length) throw new Error("truth.csv contains duplicate product_id values");
const blockIds = new Set(ids);

const allowedFontScopes = new Set([
  "brand",
  "nav",
  "row_heading",
  "row_subheader",
  "card_title",
  "card_price",
  "project_kicker",
  "project_title",
  "project_meta",
  "project_description",
  "action",
  "preview_header",
  "preview_source",
  "preview_note",
  "footer",
  "footer_social",
  "section_title",
]);

const fontRules = fontRows
  .filter((r) => r.google_font?.trim())
  .map((r) => {
    const scope = r.font_scope?.trim();
    const productId = r.font_product_id?.trim() || "";
    const family = r.google_font.trim();
    const weight = r.font_weight?.trim() || "400";
    const style = r.font_style?.trim().toLowerCase() || "normal";
    const fallback = r.font_fallback?.trim() || "sans-serif";
    if (!allowedFontScopes.has(scope)) throw new Error(`truth.csv line ${r.__line}: invalid font_scope ${scope}`);
    if (productId && !blockIds.has(productId)) throw new Error(`truth.csv line ${r.__line}: unknown font_product_id ${productId}`);
    if (!/^(?:[1-9]00)$/.test(weight)) throw new Error(`truth.csv line ${r.__line}: font_weight must be 100 through 900`);
    if (!["normal", "italic"].includes(style)) throw new Error(`truth.csv line ${r.__line}: font_style must be normal or italic`);
    return { scope, product_id: productId, family, weight, style, fallback };
  });

const first = rows[0];
const site = {
  row_heading: first.row_heading || "Quandranea",
  row_subheader: first.row_subheader || "Scene Designer",
  brand_top: first.brand_top || "Q",
  brand_bottom: first.brand_bottom || "M",
  header_nav: [
    [first.nav_home_label, first.nav_home_url],
    [first.nav_acting_label, first.nav_acting_url],
    [first.nav_design_label, first.nav_design_url],
    [first.nav_resume_label, first.nav_resume_url],
    [first.nav_contact_label, first.nav_contact_url],
  ].filter(([label, url]) => label && url).map(([label, url]) => ({ label, url })),
  footer_left: first.footer_left || "Quandrnea - 2026",
  details_label: first.details_label || "Project details",
  visit_label: first.visit_label || "Visit project",
  preview_header: first.preview_header || "Project Preview",
  preview_source_prefix: first.preview_source_prefix || "Quandranea / PROJECT",
  preview_note: first.preview_note || "Portfolio project preview",
  font_rules: fontRules,
};

const allowedAvailability = new Set(["available", "low_stock", "sold_out", "temporarily_unavailable", "discontinued", "preorder", "unknown", "mapping_error", "suspended"]);
const blocks = rows.sort((a, b) => Number(a.order) - Number(b.order)).map((r) => {
  const price = Number(r.price_minor);
  if (!Number.isInteger(price) || price < 0) throw new Error(`truth.csv line ${r.__line}: price_minor must be a non-negative integer`);
  if (!allowedAvailability.has(r.availability)) throw new Error(`truth.csv line ${r.__line}: invalid availability ${r.availability}`);
  return {
    product_id: r.product_id,
    order: Number(r.order),
    title: r.title,
    description: r.description,
    price_minor: price,
    currency: (r.currency || "usd").toLowerCase(),
    availability: r.availability,
    image_url: r.image_url,
    image_alt: r.image_alt,
    destination_label: r.destination_label || site.visit_label,
    destination_url: r.destination_url,
    footer_icon_ref: r.footer_icon_ref,
    footer_icon_label: r.footer_icon_label,
    footer_icon_url: r.footer_icon_url,
  };
});

const truth = { schema_version: "1.1.0", generated_from: "truth.csv", site, blocks };
await writeJson("data/truth.generated.json", truth);

const catalogPaths = ["data/catalogs/nume-marketplace.v1.json", "data/catalog-sync/published-marketplace.v1.json"];
for (const catalogPath of catalogPaths) {
  const catalog = await readJson(catalogPath);
  const byId = new Map(catalog.products.map((p) => [p.product_id, p]));
  for (const block of blocks) {
    const product = byId.get(block.product_id);
    if (!product) throw new Error(`${catalogPath}: missing ${block.product_id}`);
    product.title = block.title;
    product.description = block.description;
    product.active = true;
    product.status = "active";
    if (product.media?.[0]) {
      product.media[0].url = block.image_url;
      product.media[0].alt = block.image_alt;
    }
    const variant = product.variants?.[0];
    if (variant) {
      variant.retail_price.amount_minor = block.price_minor;
      variant.retail_price.currency = block.currency;
      variant.availability.status = block.availability;
      variant.active = !["sold_out", "temporarily_unavailable", "discontinued", "mapping_error", "suspended", "unknown"].includes(block.availability);
    }
  }
  await writeJson(catalogPath, catalog);
}

const layoutPaths = ["data/layout/marketplace-layout.v1.json", "data/catalog-sync/published-layout.v1.json"];
for (const layoutPath of layoutPaths) {
  const layout = await readJson(layoutPath);
  const storefront = layout.storefronts.find((s) => s.storefront_id === "storefront_numenume");
  if (storefront) storefront.display_name = site.row_heading;
  const row = layout.rows.find((r) => r.row_id === "row_nume_objects");
  if (!row) throw new Error(`${layoutPath}: missing row_nume_objects`);
  row.title = site.row_heading;
  row.subtitle = site.row_subheader;
  row.product_ids = blocks.map((b) => b.product_id);
  await writeJson(layoutPath, layout);
}

console.log(`Generated portfolio data from truth.csv: ${blocks.length} blocks, ${site.header_nav.length} nav links, ${fontRules.length} active font rules.`);
