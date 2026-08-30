import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPaths = [
  "data/catalogs/nume-marketplace.v1.json",
  "data/catalog-sync/published-marketplace.v1.json",
];
const load = async (p) => JSON.parse(await readFile(path.join(root, p), "utf8"));
const write = async (p, value) => writeFile(path.join(root, p), `${JSON.stringify(value, null, 2)}\n`);

// Snapshot everything outside the one CSV-controlled Quandranea object family.
const preserved = new Map();
for (const catalogPath of catalogPaths) {
  const catalog = await load(catalogPath);
  preserved.set(
    catalogPath,
    catalog.products.filter((product) => !product.product_id.startsWith("product_nume_objects_")),
  );
}

// The normal generator owns truth JSON, layouts, and the Quandranea object family.
await import("./generate-truth.mjs");

// Put all unrelated original catalog families back exactly as they were.
for (const catalogPath of catalogPaths) {
  const generated = await load(catalogPath);
  const objectProducts = generated.products.filter((product) => product.product_id.startsWith("product_nume_objects_"));
  generated.products = [...preserved.get(catalogPath), ...objectProducts];
  await write(catalogPath, generated);
}

console.log("Preserved all non-Quandranea NUME catalog product families.");
