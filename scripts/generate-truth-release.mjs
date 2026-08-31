import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Run the full route/font-aware generator first.
await import("./generate-truth-complete.mjs");

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
  const [header, ...body] = rows.filter((r) => r.some((value) => value !== ""));
  if (!header) return [];
  return body.map((values) => Object.fromEntries(header.map((key, i) => [key, values[i] ?? ""])));
}

const truthPath = path.join(root, "data", "truth.generated.json");
const truth = JSON.parse(await readFile(truthPath, "utf8"));
const csvRows = parseCsv(await readFile(path.join(root, "truth.csv"), "utf8"));
const first = csvRows.find((row) => !row.record_type || row.record_type === "block") || {};

const homeLabel = (first.nav_home_label || "HOME").trim();
const pageItems = (truth.site?.header_nav || []).filter((item) => item.page_key && item.page_key !== "home");
const accidentalAllHome = pageItems.length >= 2 && homeLabel && pageItems.every(
  (item) => String(item.label || "").trim().toLowerCase() === homeLabel.toLowerCase(),
);

if (accidentalAllHome) {
  const legacyLabels = {
    acting: (first.nav_acting_label || "ACTING").trim(),
    design: (first.nav_design_label || "DESIGN").trim(),
    resume: (first.nav_resume_label || "RESUME").trim(),
    contact: (first.nav_contact_label || "CONTACT").trim(),
  };
  for (const item of pageItems) {
    if (legacyLabels[item.page_key]) item.label = legacyLabels[item.page_key];
  }
  await writeFile(truthPath, `${JSON.stringify(truth, null, 2)}\n`, "utf8");
  console.log("Repaired accidental duplicated HOME labels in generated top navigation.");
}
