import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (quoted) {
      if (ch === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
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

function cleanKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

function pageCopy(value) {
  return String(value ?? "").replace(/\s*—\s*/g, " - ");
}

const csv = parseCsv(await readFile(path.join(root, "truth.csv"), "utf8"));
const truth = JSON.parse(await readFile(path.join(root, "data", "truth.generated.json"), "utf8"));
const errors = [];

for (const row of csv.filter((item) => item.record_type === "page_text" && item.product_id !== "q-fonts")) {
  const key = cleanKey(row.product_id);
  const field = String(row.title || "").trim();
  const page = truth.pages?.[key];
  if (!page || !(field in page)) continue;
  const expected = pageCopy(row.description);
  const actual = pageCopy(page[field]);
  if (actual !== expected) errors.push(`${key}.${field} was overwritten: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}

const sectionFields = {
  title: "header",
  destination_label: "subheader",
  description: "body",
  image_url: "image_url",
  image_alt: "image_alt",
  section_link_url: "image_link_url",
};
for (const row of csv.filter((item) => item.record_type === "page_section")) {
  const key = cleanKey(row.product_id);
  const order = Number(row.order);
  const section = truth.pages?.[key]?.sections?.find((item) => Number(item.order) === order);
  if (!section) {
    errors.push(`${key} section ${order} disappeared during generation`);
    continue;
  }
  for (const [csvField, generatedField] of Object.entries(sectionFields)) {
    const expected = pageCopy(row[csvField]);
    const actual = pageCopy(section[generatedField]);
    if (actual !== expected) errors.push(`${key} section ${order} ${generatedField} was overwritten`);
  }
}

const blocks = csv.filter((item) => !item.record_type || item.record_type === "block");
for (const row of blocks) {
  const block = truth.blocks?.find((item) => item.product_id === row.product_id);
  if (!block) {
    errors.push(`block ${row.product_id} disappeared during generation`);
    continue;
  }
  for (const field of ["title", "description", "image_url", "image_alt", "destination_url"]) {
    if (String(block[field] ?? "") !== String(row[field] ?? "")) errors.push(`block ${row.product_id} ${field} was overwritten`);
  }
}

const expectedProjectGallerySizes = {
  "project-a": 8,
  "project-b": 8,
  "project-e": 8,
  "project-f": 6,
};
for (const [key, expectedSize] of Object.entries(expectedProjectGallerySizes)) {
  if (truth.pages?.[key]?.sections?.length !== expectedSize) {
    errors.push(`${key} must generate exactly ${expectedSize} gallery images`);
  }
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Verified ${blocks.length} blocks, editable page copy, section content, URLs, and all four Props galleries.`);
