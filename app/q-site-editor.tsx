"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import truthData from "../data/truth.generated.json";

const REPOSITORY = "thanks-cohn/portofolio";
const BRANCH = "main";
const REMOTE_TRUTH = "truth.csv";
const DRAFT_KEY = "quandranea-site-editor-drafts-v1";

type EditKind = "text" | "image" | "url";
type Draft = {
  record: "block" | "global" | "page_text" | "page_section";
  product?: string;
  order?: string;
  field: string;
  kind: EditKind;
  value: string;
};

type Target = Draft & { element: HTMLElement };
type LinkTarget = Draft & { element: HTMLElement; kind: "url" };
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
  const value = node.dataset.qValue !== undefined
    ? node.dataset.qValue
    : kind === "image" && node instanceof HTMLImageElement
      ? (node.getAttribute("src") || node.src)
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

function linkFromElement(element: HTMLElement): LinkTarget | null {
  const node = element.closest<HTMLElement>("[data-q-link-field]");
  if (!node) return null;
  const record = node.dataset.qLinkRecord as Draft["record"] | undefined;
  const field = node.dataset.qLinkField || "";
  if (!record || !field) return null;
  return {
    element: node,
    record,
    product: node.dataset.qLinkProduct,
    order: node.dataset.qLinkOrder,
    field,
    kind: "url",
    value: node.dataset.qLinkValue ?? (node instanceof HTMLAnchorElement ? (node.getAttribute("href") || "") : ""),
  };
}

function editorHref(value: string) {
  const text = value.trim();
  if (!text || /^(?:https?:)?\/\//i.test(text) || /^(?:mailto|tel):/i.test(text) || text.startsWith("#")) return text;
  const path = text.startsWith("/") ? text : `/${text}`;
  const base = String(process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/^\/+|\/+$/g, "");
  return base && !path.startsWith(`/${base}/`) ? `/${base}${path}` : path;
}

function applyDraftToDom(draft: Draft) {
  const isUrl = draft.kind === "url";
  const prefix = isUrl ? "data-q-link-" : "data-q-";
  const selector = [
    isUrl ? "[data-q-link-field]" : `[data-q-edit="${draft.kind}"]`,
    `[${prefix}record="${draft.record}"]`,
    `[${prefix}field="${CSS.escape(draft.field)}"]`,
    draft.product ? `[${prefix}product="${CSS.escape(draft.product)}"]` : "",
    draft.order ? `[${prefix}order="${CSS.escape(draft.order)}"]` : "",
  ].join("");
  document.querySelectorAll<HTMLElement>(selector).forEach((node) => {
    if (isUrl) {
      node.dataset.qLinkValue = draft.value;
      if (node instanceof HTMLAnchorElement) {
        if (draft.value.trim()) node.setAttribute("href", editorHref(draft.value));
        else node.removeAttribute("href");
      }
      return;
    }
    node.dataset.qValue = draft.value;
    if (draft.kind === "image" && node instanceof HTMLImageElement) {
      if (node.getAttribute("src") !== draft.value) node.setAttribute("src", draft.value);
      return;
    }
    if (node.textContent !== draft.value) node.textContent = draft.value;
    if (node instanceof HTMLAnchorElement && draft.field === "email") node.href = `mailto:${draft.value}`;
  });
}

function applyAllDraftsToDom() {
  Object.values(loadDrafts()).forEach(applyDraftToDom);
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
  const [linkTarget, setLinkTarget] = useState<LinkTarget | null>(null);
  const [editorValue, setEditorValue] = useState("");
  const [linkValue, setLinkValue] = useState("");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [position, setPosition] = useState({ x: 24, y: 24 });
  const drag = useRef<{ pointerId: number; rootX: number; rootY: number; x: number; y: number } | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const fadeTimer = useRef<number | null>(null);

  const draftCount = Object.keys(typeof window === "undefined" ? {} : loadDrafts()).length;

  const scheduleFade = useCallback(() => {
    if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
    fadeTimer.current = window.setTimeout(() => setFaded(true), 10_000);
  }, []);

  const reveal = useCallback(() => {
    setFaded(false);
    scheduleFade();
  }, [scheduleFade]);

  useEffect(() => {
    const positionFrame = window.requestAnimationFrame(() => {
      setPosition({ x: Math.max(16, window.innerWidth - 84), y: Math.max(16, window.innerHeight - 92) });
    });
    scheduleFade();
    applyAllDraftsToDom();
    const observer = new MutationObserver(applyAllDraftsToDom);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.cancelAnimationFrame(positionFrame);
      observer.disconnect();
      if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
    };
  }, [scheduleFade]);

  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (mode !== "edit") return;
      const found = editableFromElement(event.target as HTMLElement);
      const foundLink = linkFromElement(event.target as HTMLElement);
      if (!found && !foundLink) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const drafts = loadDrafts();
      const primary = found || foundLink;
      if (!primary) return;
      const existing = drafts[draftId(primary)];
      const next = existing ? { ...primary, value: existing.value } : primary;
      setTarget(next);
      setEditorValue(next.value);
      if (found && foundLink && draftId(found) !== draftId(foundLink)) {
        const existingLink = drafts[draftId(foundLink)];
        const nextLink = existingLink ? { ...foundLink, value: existingLink.value } : foundLink;
        setLinkTarget(nextLink);
        setLinkValue(nextLink.value);
      } else {
        setLinkTarget(null);
        setLinkValue("");
      }
      setMenu(null);
      reveal();
    };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, [mode, reveal]);

  function saveEdit() {
    if (!target) return;
    const draft: Draft = {
      record: target.record,
      product: target.product,
      order: target.order,
      field: target.field,
      kind: target.kind,
      value: editorValue,
    };
    const drafts = loadDrafts();
    drafts[draftId(draft)] = draft;
    applyDraftToDom(draft);
    if (linkTarget) {
      const linkDraft: Draft = {
        record: linkTarget.record,
        product: linkTarget.product,
        order: linkTarget.order,
        field: linkTarget.field,
        kind: "url",
        value: linkValue,
      };
      drafts[draftId(linkDraft)] = linkDraft;
      applyDraftToDom(linkDraft);
    }
    saveDrafts(drafts);
    setTarget(null);
    setLinkTarget(null);
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
      setTarget(null);
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
        onChange={(event) => {
          const file = event.target.files?.[0];
          void tokenChosen(file);
          event.currentTarget.value = "";
        }}
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
          setMenu({ x: Math.min(event.clientX, window.innerWidth - 220), y: Math.min(event.clientY, window.innerHeight - 230) });
        }}
      >
        Q
      </button>

      {menu ? (
        <div className="q-site-menu" style={{ left: menu.x, top: menu.y }} role="menu" onMouseLeave={() => setMenu(null)}>
          <button type="button" onClick={() => { setMode("edit"); setMenu(null); setStatus("EDIT mode. Click text, an image, or a link."); }}>EDIT</button>
          <button type="button" onClick={() => { setMode("readonly"); setTarget(null); setLinkTarget(null); setMenu(null); setStatus("READ ONLY"); }}>READ ONLY</button>
          <div className="q-site-menu-rule" />
          <button type="button" disabled={publishing} onClick={publish}>{publishing ? "PUBLISHING..." : "PUBLISH"}</button>
          <div className="q-site-menu-rule" />
          <button type="button" onClick={chooseToken}>GITHUB TOKEN FILE...</button>
          <small>{draftCount ? `${draftCount} unpublished edit${draftCount === 1 ? "" : "s"}` : "No unpublished edits"}</small>
        </div>
      ) : null}

      {target ? (
        <div className="q-site-edit-panel" role="dialog" aria-label={target.kind === "text" ? "Edit text" : "Edit URL"}>
          <strong>{target.kind === "text" ? "TEXT" : target.kind === "image" ? "IMAGE URL" : "LINK URL"}</strong>
          {target.kind !== "text" ? (
            <input type="url" value={editorValue} onChange={(event) => setEditorValue(event.target.value)} autoFocus />
          ) : (
            <textarea value={editorValue} onChange={(event) => setEditorValue(event.target.value)} rows={6} autoFocus />
          )}
          {linkTarget ? (
            <label className="q-site-link-field">
              <span>LINK URL</span>
              <input type="url" value={linkValue} onChange={(event) => setLinkValue(event.target.value)} />
            </label>
          ) : null}
          <div>
            <button type="button" onClick={() => { setTarget(null); setLinkTarget(null); }}>Cancel</button>
            <button type="button" onClick={saveEdit}>Save</button>
          </div>
        </div>
      ) : null}

      {status ? <div className="q-site-status" onClick={() => setStatus("")}>{status}</div> : null}
    </>
  );
}
