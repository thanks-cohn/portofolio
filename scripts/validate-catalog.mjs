import { readFile } from "node:fs/promises";

const load = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
const [catalog, layout, groups, styles, publishedLayout] = await Promise.all([
  load("data/catalogs/nume-marketplace.v1.json"), load("data/layout/marketplace-layout.v1.json"),
  load("data/styles/entrepreneur-groups.v1.json"), load("data/styles/row-styles.v1.json"), load("data/catalog-sync/published-layout.v1.json"),
]);
const errors = [];
if (JSON.stringify(layout) !== JSON.stringify(publishedLayout)) errors.push("source layout and published layout snapshot differ");
if (layout.rows.at(-1)?.title !== "Q&A") errors.push("canonical final row title must be Q&A");
const allowedAvailability = new Set(["available", "low_stock", "sold_out", "temporarily_unavailable", "discontinued", "preorder", "unknown", "mapping_error", "suspended"]);
const allowedExternal = new Set(["stripe_product", "stripe_price", "printify_product", "printify_variant", "printful_product", "printful_variant", "merchant_sku", "other"]);
const allowedTokens = new Set(["color_background", "color_surface", "color_soft_surface", "color_foreground", "color_accent", "color_edge", "font_heading", "font_body", "heading_size", "heading_weight", "heading_tracking", "border_style", "decoration", "header_alignment", "title_composition", "image_treatment", "card_radius_px", "rotunda_surface", "vendor_image_fallback_background", "vendor_image_fallback_foreground"]);
const unique = (values, label) => values.length === new Set(values).size || errors.push(`duplicate ${label}`);
unique(catalog.products.map((p) => p.product_id), "product_id");
unique(catalog.products.flatMap((p) => p.variants.map((v) => v.variant_id)), "variant_id");
const storefronts = new Set(layout.storefronts.map((s) => s.storefront_id));
const providers = new Set(catalog.providers.map((p) => p.provider_id));
const products = new Map(catalog.products.map((p) => [p.product_id, p]));
for (const product of catalog.products) {
  if (!storefronts.has(product.storefront_id)) errors.push(`${product.product_id}: unknown storefront`);
  if (!product.media.length || !product.media[0].alt?.trim()) errors.push(`${product.product_id}: missing media or alt text`);
  if (!product.variants.length) errors.push(`${product.product_id}: missing variants`);
  for (const ref of product.external_references) if (!allowedExternal.has(ref.system) || !ref.id) errors.push(`${product.product_id}: malformed external reference`);
  for (const variant of product.variants) {
    if (!Number.isInteger(variant.retail_price.amount_minor) || variant.retail_price.amount_minor < 0 || !/^[a-z]{3}$/.test(variant.retail_price.currency)) errors.push(`${variant.variant_id}: invalid price or currency`);
    if (!allowedAvailability.has(variant.availability.status)) errors.push(`${variant.variant_id}: invalid availability`);
    if (variant.fulfillment && !providers.has(variant.fulfillment.provider_id)) errors.push(`${variant.variant_id}: unknown provider`);
    for (const ref of variant.external_references) if (!allowedExternal.has(ref.system) || !ref.id) errors.push(`${variant.variant_id}: malformed external reference`);
  }
}
if (layout.rows.length !== 5) errors.push("layout must contain exactly five rows");
for (const row of layout.rows) {
  if (row.row_id === "row_nume_objects") {
    if (row.product_ids.length < 1) errors.push(`${row.row_id}: must contain at least one product`);
  } else if (row.product_ids.length !== 10) {
    errors.push(`${row.row_id}: must contain ten products`);
  }
  for (const id of row.product_ids) if (!products.has(id)) errors.push(`${row.row_id}: missing product ${id}`);
  for (const id of row.product_ids) if (products.get(id)?.storefront_id !== row.storefront_id) errors.push(`${row.row_id}: storefront mismatch for ${id}`);
}
for (const profile of [...groups.groups, ...styles.profiles]) for (const token of Object.keys(profile.tokens)) if (!allowedTokens.has(token)) errors.push(`${profile.style_profile_id}: unsafe token ${token}`);
if (errors.length) { console.error(`NUME Catalog validation failed:\n- ${errors.join("\n- ")}`); process.exit(1); }
console.log(`NUME Catalog valid: ${catalog.products.length} products across ${layout.rows.length} rows.`);