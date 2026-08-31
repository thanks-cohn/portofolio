"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import truthData from "../data/truth.generated.json";

const REPOSITORY = "thanks-cohn/portofolio";
const BRANCH = "main";
const REMOTE_TRUTH = "truth.csv";
const DRAFT_KEY = "quandranea-site-editor-drafts-v1";

type EditKind = "text" | "image";
type Draft = {
  record: "block" | "global" | "page_text" | "page_section";
  product?: string;
  order?: string;
  field: string;
  kind: EditKind;
  value: string;
};

type Target = Draft & { element: HTMLElement };

type CsvData = { header: string[]; rows: Record<string, string>[] };

function draftId(draft: Omit<Draft, "value"> | Draft) {
  return [draft.record, draft.product || "", draft.order || "", draft.field].join("|");
}

function loadDrafts(): Record<string, Draft> {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveDrafts(drafts: Record<string, Draft>) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
}

function editableFromElement(element: HTMLElement): Target | null {
  const node = element.closest<HTMLElement>("[data-q-edit]");
  if (!node) return null;
  const record = node.dataset.qRecord as Draft["record"] | undefined;
  const field = node.dataset.qField || "";
  const kind = node.dataset.qEdit as EditKind | undefined;
  if (!record || !field || (kind !== "text" && kind !== "image")) return null;
  const value = kind === "image"
    ? (node instanceof HTMLImageElement ? node.src : node.dataset.qValue || "")
    : (node.textContent || "").trim();
  return {
    element: node,
    record,
    product: node.dataset.qProduct,
    order: node.dataset.qOrder,
    field,
    kind,
    value,
  };
}

function applyDraftToDom(draft: Draft) {
  const selector = [
    `[data-q-edit="${draft.kind}"]`,
    `[data-q-record="${draft.record}"]`,
    `[data-q-field="${CSS.escape(draft.field)}"]`,
    draft.product ? `[data-q-product="${CSS.escape(draft.product)}"]` : "",
    draft.order ? `[data-q-order="${CSS.escape(draft.order)}"]` : "",
  ].join("");
  document.querySelectorAll<HTMLElement>(selector).forEach((node) => {
    if (draft.kind === "image" && node instanceof HTMLImageElement) {
      if (node.src !== draft.value) node.src = draft.value;
      return;
    }
    if (node.textContent !== draft.value) node.textContent = draft.value;
    if (node instanceof HTMLAnchorElement && draft.field === "email") node.href = `mailto:${draft.value}`;
  });
}

function parseCsv(text: string): CsvData {
  const matrix: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (quoted) {
      if (ch === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field.replace(/\r$/, "")); matrix.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); matrix.push(row); }
  const nonempty = matrix.filter((item) => item.some((value) => value !== ""));
  const header = nonempty[0] || [];
  const rows = nonempty.slice(1).map((values) => Object.fromEntries(header.map((key, i) => [key, values[i] ?? ""])));
  return { header, rows };
}

function csvCell(value: string) {
  const text = value ?? "";
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function serializeCsv(data: CsvData) {
  return [
    data.header.map(csvCell).join(","),
    ...data.rows.map((row) => data.header.map((field) => csvCell(row[field] || "")).join(",")),
  ].join("\n") + "\n";
}

function blankRow(header: string[]) {
  return Object.fromEntries(header.map((field) => [field, ""]));
}

function cleanPageKey(value: string) {
  return (value || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

function ensurePageTextRow(data: CsvData, draft: Draft) {
  let row = data.rows.find((item) => item.record_type === "page_text" && cleanPageKey(item.product_id) === cleanPageKey(draft.product || "") && item.title === draft.field);
  if (!row) {
    row = blankRow(data.header);
    row.record_type = "page_text";
    row.product_id = draft.product || "";
    row.title = draft.field;
    const page = (truthData.pages as unknown as Record<string, Record<string, unknown>>)[cleanPageKey(draft.product || "")];
    const current = page?.[draft.field];
    row.description = typeof current === "string" ? current : "";
    data.rows.push(row);
  }
  return row;
}

function seedSectionRow(data: CsvData, draft: Draft) {
  const row = blankRow(data.header);
  const pageKey = cleanPageKey(draft.product || "");
  const page = (truthData.pages as unknown as Record<string, { sections?: Array<Record<string, unknown>> }>)[pageKey];
  const section = page?.sections?.find((item) => String(item.order ?? "") === String(draft.order ?? ""));
  row.record_type = "page_section";
  row.product_id = draft.product || "";
  row.order = draft.order || "1";
  if (section) {
    row.availability = String(section.image_side || "left");
    row.image_url = String(section.image_url || "");
    row.image_alt = String(section.image_alt || "");
    row.title = String(section.header || "");
    row.destination_label = String(section.subheader || "");
    row.description = String(section.body || "");
    row.font_scope = String(section.header_tag || "h2");
    row.font_product_id = String(section.subheader_tag || "h3");
    row.color_scope = String(section.body_tag || "p");
    row.text_color = String(section.header_color || "");
    row.color_product_id = String(section.subheader_color || "");
    row.footer_icon_ref = String(section.body_color || "");
    row.destination_url = String(section.header_font_url || "");
    row.footer_icon_label = String(section.subheader_font_url || "");
    row.footer_icon_url = String(section.body_font_url || "");
    if ("header_size" in row) row.header_size = String(section.header_size || "");
    if ("subheader_size" in row) row.subheader_size = String(section.subheader_size || "");
    if ("body_size" in row) row.body_size = String(section.body_size || "");
    if ("section_link_url" in row) row.section_link_url = String(section.image_link_url || "");
  }
  data.rows.push(row);
  return row;
}

function applyDraftsToCsv(data: CsvData, drafts: Draft[]) {
  const firstBlock = data.rows.find((row) => !row.record_type || row.record_type === "block");
  for (const draft of drafts) {
    if (draft.record === "global") {
      if (firstBlock && data.header.includes(draft.field)) firstBlock[draft.field] = draft.value;
      continue;
    }
    if (draft.record === "block") {
      const row = data.rows.find((item) => (!item.record_type || item.record_type === "block") && item.product_id === draft.product);
      if (row && data.header.includes(draft.field)) row[draft.field] = draft.value;
      continue;
    }
    if (draft.record === "page_text") {
      const row = ensurePageTextRow(data, draft);
      row.description = draft.value;
      continue;
    }
    if (draft.record === "page_section") {
      let row = data.rows.find((item) => item.record_type === "page_section" && cleanPageKey(item.product_id) === cleanPageKey(draft.product || "") && String(item.order || "") === String(draft.order || ""));
      if (!row) row = seedSectionRow(data, draft);
      if (data.header.includes(draft.field)) row[draft.field] = draft.value;
    }
  }
}

function decodeBase64Utf8(value: string) {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function cleanToken(raw: string) {
  const value = raw.trim();
  if (/^bearer\s+/i.test(value)) return value.replace(/^bearer\s+/i, "").trim();
  if (/^token\s+/i.test(value)) return value.replace(/^token\s+/i, "").trim();
  return value;
}

export function QSiteEditor() {
  const [mode, setMode] = useState<"readonly" | "edit">("readonly");
  const [faded, setFaded] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [editorValue, setEditorValue] = useState("");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [position, setPosition] = useState({ x: 24, y: 24 });
  const drag = useRef<{ pointerId: number; rootX: number; rootY: number; x: number; y: number } | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const fadeTimer = useRef<number | null>(null);

  const draftCount = useMemo(() => Object.keys(typeof window === "undefined" ? {} : loadDrafts()).length, [status, target]);

  function scheduleFade() {
    if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
    fadeTimer.current = window.setTimeout(() => setFaded(true), 10_000);
  }

  function reveal() {
    setFaded(false);
    scheduleFade();
  }

  useEffect(() => {
    setPosition({ x: Math.max(16, window.innerWidth - 84), y: Math.max(16, window.innerHeight - 92) });
    scheduleFade();
    const drafts = loadDrafts();
    const apply = () => Object.values(drafts).forEach(applyDraftToDom);
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
    };
  }, []);

  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (mode !== "edit") return;
      const found = editableFromElement(event.target as HTMLElement);
      if (!found) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const existing = loadDrafts()[draftId(found)];
      const next = existing ? { ...found, value: existing.value } : found;
      setTarget(next);
      setEditorValue(next.value);
      setMenu(null);
      reveal();
    };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, [mode]);

  function saveEdit() {
    if (!target) return;
    const draft: Draft = { ...target, value: editorValue };
    delete (draft as Partial<Target>).element;
    const drafts = loadDrafts();
    drafts[draftId(draft)] = draft;
    saveDrafts(drafts);
    applyDraftToDom(draft);
    setTarget(null);
    setStatus("Saved locally. Publish when ready.");
    reveal();
  }

  function chooseToken() {
    setMenu(null);
    fileInput.current?.click();
    reveal();
  }

  async function tokenChosen(file?: File) {
    if (!file) return;
    const value = cleanToken(await file.text());
    if (!value) {
      setStatus("That token file is empty.");
      return;
    }
    setToken(value);
    setStatus("GitHub token loaded for this browser session.");
  }

  async function publish() {
    setMenu(null);
    reveal();
    const drafts = Object.values(loadDrafts());
    if (!drafts.length) {
      setStatus("There are no unpublished edits.");
      return;
    }
    if (!token) {
      setStatus("Choose GitHub Token File first.");
      fileInput.current?.click();
      return;
    }
    setPublishing(true);
    setStatus("Publishing...");
    try {
      const api = `https://api.github.com/repos/${REPOSITORY}/contents/${REMOTE_TRUTH}?ref=${encodeURIComponent(BRANCH)}`;
      const headers = {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      };
      const currentResponse = await fetch(api, { headers });
      if (!currentResponse.ok) throw new Error(`GitHub read failed (${currentResponse.status}).`);
      const current = await currentResponse.json();
      if (typeof current.content !== "string" || typeof current.sha !== "string") throw new Error("GitHub did not return truth.csv.");
      const csv = parseCsv(decodeBase64Utf8(current.content));
      applyDraftsToCsv(csv, drafts);
      const updated = serializeCsv(csv);
      const writeResponse = await fetch(`https://api.github.com/repos/${REPOSITORY}/contents/${REMOTE_TRUTH}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Publish portfolio edits from floating Q editor",
          content: encodeBase64Utf8(updated),
          sha: current.sha,
          branch: BRANCH,
        }),
      });
      if (!writeResponse.ok) {
        const detail = await writeResponse.json().catch(() => ({}));
        throw new Error(detail?.message || `GitHub publish failed (${writeResponse.status}).`);
      }
      localStorage.removeItem(DRAFT_KEY);
      setMode("readonly");
      setStatus("Published. The official site is redeploying.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Publish failed.");
    } finally {
      setPublishing(false);
    }
  }

  function beginDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    drag.current = { pointerId: event.pointerId, rootX: event.clientX, rootY: event.clientY, x: position.x, y: position.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    reveal();
  }

  function moveDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const x = Math.min(Math.max(4, current.x + event.clientX - current.rootX), window.innerWidth - 60);
    const y = Math.min(Math.max(4, current.y + event.clientY - current.rootY), window.innerHeight - 60);
    setPosition({ x, y });
  }

  function endDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
    scheduleFade();
  }

  return (
    <>
      <input
        ref={fileInput}
        className="q-site-hidden-file"
        type="file"
        accept=".txt,text/plain"
        onChange={(event) => tokenChosen(event.target.files?.[0])}
      />

      <button
        type="button"
        className={`q-site-orb ${faded ? "is-faded" : ""} ${mode === "edit" ? "is-editing" : ""}`}
        style={{ left: position.x, top: position.y }}
        aria-label="Quandranea editor menu"
        title={mode === "edit" ? "EDIT mode. Right-click for options." : "READ ONLY. Right-click for options."}
        onMouseEnter={reveal}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onContextMenu={(event) => {
          event.preventDefault();
          reveal();
          setMenu({ x: event.clientX, y: event.clientY });
        }}
      >
        Q
      </button>

      {menu ? (
        <div className="q-site-menu" style={{ left: menu.x, top: menu.y }} role="menu" onMouseLeave={() => setMenu(null)}>
          <button type="button" onClick={() => { setMode("edit"); setMenu(null); setStatus("EDIT mode. Click text or an image."); }}>EDIT</button>
          <button type="button" onClick={() => { setMode("readonly"); setTarget(null); setMenu(null); setStatus("READ ONLY"); }}>READ ONLY</button>
          <div className="q-site-menu-rule" />
          <button type="button" disabled={publishing} onClick={publish}>{publishing ? "PUBLISHING..." : "PUBLISH"}</button>
          <div className="q-site-menu-rule" />
          <button type="button" onClick={chooseToken}>GITHUB TOKEN FILE...</button>
          <small>{draftCount ? `${draftCount} unpublished edit${draftCount === 1 ? "" : "s"}` : "No unpublished edits"}</small>
        </div>
      ) : null}

      {target ? (
        <div className="q-site-edit-panel" role="dialog" aria-label={target.kind === "image" ? "Edit image URL" : "Edit text"}>
          <strong>{target.kind === "image" ? "IMAGE URL" : "TEXT"}</strong>
          {target.kind === "image" ? (
            <input type="url" value={editorValue} onChange={(event) => setEditorValue(event.target.value)} autoFocus />
          ) : (
            <textarea value={editorValue} onChange={(event) => setEditorValue(event.target.value)} rows={6} autoFocus />
          )}
          <div>
            <button type="button" onClick={() => setTarget(null)}>Cancel</button>
            <button type="button" onClick={saveEdit}>Save</button>
          </div>
        </div>
      ) : null}

      {status ? <div className="q-site-status" onClick={() => setStatus("")}>{status}</div> : null}
    </>
  );
}
