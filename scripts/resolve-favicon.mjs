import { access, copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const generatedDir = path.join(publicDir, "_generated");
const outputData = path.join(root, "data", "favicon.generated.json");

const supported = new Set([
  ".ico",
  ".png",
  ".svg",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".avif",
]);

// Prefer explicit design assets, then ordinary public assets. The only naming
// contract is favicon.<supported extension>.
const searchDirs = [
  path.join(root, "assets", "images"),
  path.join(root, "public", "assets", "images"),
  publicDir,
];

async function exists(directory) {
  try {
    await access(directory);
    return true;
  } catch {
    return false;
  }
}

async function findFavicon() {
  for (const directory of searchDirs) {
    if (!(await exists(directory))) continue;
    const entries = await readdir(directory, { withFileTypes: true });
    const candidates = entries
      .filter((entry) => entry.isFile())
      .map((entry) => ({ name: entry.name, ext: path.extname(entry.name).toLowerCase() }))
      .filter((entry) => path.basename(entry.name, path.extname(entry.name)).toLowerCase() === "favicon" && supported.has(entry.ext))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (candidates.length) return path.join(directory, candidates[0].name);
  }
  return null;
}

await rm(generatedDir, { recursive: true, force: true });
const source = await findFavicon();

let href = "/jester-cry-laugh.svg";
let sourcePath = "public/jester-cry-laugh.svg";
if (source) {
  const ext = path.extname(source).toLowerCase();
  const relative = path.relative(root, source).replaceAll(path.sep, "/");
  sourcePath = relative;
  if (relative.startsWith("public/")) {
    href = `/${relative.slice("public/".length)}`;
  } else {
    await mkdir(generatedDir, { recursive: true });
    const target = path.join(generatedDir, `favicon${ext}`);
    await copyFile(source, target);
    href = `/_generated/favicon${ext}`;
  }
}

await writeFile(outputData, `${JSON.stringify({ href, source: sourcePath }, null, 2)}\n`, "utf8");
console.log(`Resolved favicon ${sourcePath} -> ${href}`);
