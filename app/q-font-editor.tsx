"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import truthData from "../data/truth.generated.json";

const DRAFT_KEY = "quandranea-site-editor-drafts-v1";
const FONT_PRODUCT = "q-fonts";

type FontMode = "single" | "multi";
type FontTarget = {
  record: string;
  product: string;
  order: string;
  field: string;
  element: HTMLElement;
};

type FontIdentity = Omit<FontTarget, "element">;
type ParsedFont = {
  href: string;
  family: string;
  families: string[];
  raw: string;
};

type StoredDraft = {
  record: string;
  product?: string;
  order?: string;
  field: string;
  kind?: string;
  value: string;
};

type PublishedFont = {
  target: FontIdentity;
  font: ParsedFont;
};

function loadDraftMap(): Record<string, StoredDraft> {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveDraftMap(drafts: Record<string, StoredDraft>) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
}

function targetId(target: FontIdentity) {
  return [target.record, target.product, target.order, target.field].join("|");
}

function targetFromElement(element: Element | null): FontTarget | null {
  const node = element?.closest<HTMLElement>('[data-q-edit="text"]');
  if (!node) return null;
  const record = node.dataset.qRecord || "";
  const field = node.dataset.qField || "";
  if (!record || !field) return null;
  return {
    record,
    product: node.dataset.qProduct || "",
    order: node.dataset.qOrder || "",
    field,
    element: node,
  };
}

function encodePart(value: string) {
  return encodeURIComponent(value || "");
}

function fontDraftField(target: FontIdentity) {
  return ["font", target.record, target.product, target.order, target.field].map(encodePart).join("::");
}

function decodePart(value: string) {
  try { return decodeURIComponent(value || ""); } catch { return value || ""; }
}

function targetFromFontDraft(field: string): FontIdentity | null {
  const parts = String(field || "").split("::");
  if (parts.length !== 5 || decodePart(parts[0]) !== "font") return null;
  const record = decodePart(parts[1]);
  const product = decodePart(parts[2]);
  const order = decodePart(parts[3]);
  const targetField = decodePart(parts[4]);
  if (!record || !targetField) return null;
  return { record, product, order, field: targetField };
}

function parseFontInput(value: string): ParsedFont | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  let href = "";
  const htmlMatch = raw.match(/href\s*=\s*["'](https:\/\/fonts\.googleapis\.com\/[^"']+)["']/i);
  if (htmlMatch) href = htmlMatch[1].replace(/&amp;/g, "&");
  else {
    const urlMatch = raw.match(/https:\/\/fonts\.googleapis\.com\/[^\s"'<>]+/i);
    if (urlMatch) href = urlMatch[0].replace(/&amp;/g, "&");
  }
  if (!href) return null;
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" || url.hostname !== "fonts.googleapis.com") return null;
    const families = url.searchParams.getAll("family")
      .map((item) => item.split(":")[0].replace(/\+/g, " ").trim())
      .filter(Boolean);
    if (!families.length) return null;
    return { href, family: families[0], families, raw };
  } catch {
    return null;
  }
}

function reorderedFontInput(raw: string, family: string) {
  const parsed = parseFontInput(raw);
  if (!parsed) return raw.trim();
  try {
    const url = new URL(parsed.href);
    const specs = url.searchParams.getAll("family");
    const chosen = specs.find((spec) => spec.split(":")[0].replace(/\+/g, " ").trim() === family);
    if (!chosen) return raw.trim();
    const ordered = [chosen, ...specs.filter((spec) => spec !== chosen)];
    url.searchParams.delete("family");
    for (const spec of ordered) url.searchParams.append("family", spec);
    const href = url.toString();
    const hrefPattern = /(href\s*=\s*["'])(https:\/\/fonts\.googleapis\.com\/[^"']+)(["'])/i;
    if (hrefPattern.test(raw)) return raw.replace(hrefPattern, (_all, before, _old, after) => `${before}${href}${after}`);
    return href;
  } catch {
    return raw.trim();
  }
}

function ensureFontLink(href: string) {
  const exists = Array.from(document.querySelectorAll<HTMLLinkElement>('link[data-q-font-stylesheet="true"]'))
    .some((link) => link.href === href);
  if (exists) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.qFontStylesheet = "true";
  document.head.appendChild(link);
}

function selectorForTarget(target: FontIdentity) {
  const pieces = [
    '[data-q-edit="text"]',
    `[data-q-record="${CSS.escape(target.record)}"]`,
    `[data-q-field="${CSS.escape(target.field)}"]`,
  ];
  if (target.product) pieces.push(`[data-q-product="${CSS.escape(target.product)}"]`);
  if (target.order) pieces.push(`[data-q-order="${CSS.escape(target.order)}"]`);
  return pieces.join("");
}

function applyFont(target: FontIdentity, font: ParsedFont) {
  ensureFontLink(font.href);
  const safeFamily = font.family.replace(/'/g, "\\'");
  document.querySelectorAll<HTMLElement>(selectorForTarget(target)).forEach((node) => {
    node.style.setProperty("font-family", `'${safeFamily}', sans-serif`, "important");
  });
}

function publishedFonts(): PublishedFont[] {
  return ((truthData as unknown as { q_fonts?: PublishedFont[] }).q_fonts || [])
    .filter((item) => item?.target?.record && item?.target?.field && item?.font?.href && item?.font?.family);
}

function draftFonts(): PublishedFont[] {
  return Object.values(loadDraftMap()).flatMap((draft) => {
    if (draft.record !== "page_text" || draft.product !== FONT_PRODUCT || !draft.field.startsWith("font::")) return [];
    const target = targetFromFontDraft(draft.field);
    const font = parseFontInput(draft.value);
    return target && font ? [{ target, font }] : [];
  });
}

function applyAllFonts() {
  for (const item of publishedFonts()) applyFont(item.target, item.font);
  for (const item of draftFonts()) applyFont(item.target, item.font);
}

function removeSelectionClasses() {
  document.querySelectorAll<HTMLElement>(".q-font-selected").forEach((node) => node.classList.remove("q-font-selected"));
}

export function QFontEditor() {
  const [menuHost, setMenuHost] = useState<HTMLElement | null>(null);
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const [fontMode, setFontMode] = useState<FontMode | null>(null);
  const [selections, setSelections] = useState<FontTarget[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [fontInput, setFontInput] = useState("");
  const [family, setFamily] = useState("");
  const [notice, setNotice] = useState("");

  const parsed = useMemo(() => parseFontInput(fontInput), [fontInput]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!parsed?.families.length) setFamily("");
      else if (!parsed.families.includes(family)) setFamily(parsed.families[0]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fontInput, parsed, family]);

  useEffect(() => {
    const refresh = () => {
      const next = document.querySelector<HTMLElement>(".q-site-menu");
      setMenuHost((current) => current === next ? current : next);
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    applyAllFonts();
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        applyAllFonts();
      });
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-q-edit", "data-q-record", "data-q-product", "data-q-order", "data-q-field"],
    });
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("q-font-picking", Boolean(fontMode));
    if (!fontMode) removeSelectionClasses();
    return () => document.body.classList.remove("q-font-picking");
  }, [fontMode]);

  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (!fontMode) return;
      const origin = event.target instanceof Element ? event.target : null;
      if (!origin || origin.closest(".q-site-orb, .q-site-menu, .q-font-panel, .q-font-notice")) return;
      const found = targetFromElement(origin);
      if (!found) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (fontMode === "single") {
        removeSelectionClasses();
        found.element.classList.add("q-font-selected");
        setSelections([found]);
        setPanelOpen(true);
        setNotice("1 text item selected.");
        return;
      }

      const id = targetId(found);
      setSelections((current) => {
        const exists = current.some((item) => targetId(item) === id);
        if (exists) {
          found.element.classList.remove("q-font-selected");
          const next = current.filter((item) => targetId(item) !== id);
          setNotice(`${next.length} text item${next.length === 1 ? "" : "s"} selected.`);
          return next;
        }
        found.element.classList.add("q-font-selected");
        const next = [...current, found];
        setNotice(`${next.length} text item${next.length === 1 ? "" : "s"} selected.`);
        return next;
      });
      setPanelOpen(true);
    };

    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !fontMode) return;
      removeSelectionClasses();
      setSelections([]);
      setPanelOpen(false);
      setFontMode(null);
      setNotice("Font selection cancelled.");
    };

    document.addEventListener("click", click, true);
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", keydown, true);
    };
  }, [fontMode]);

  function beginFontMode(nextMode: FontMode) {
    removeSelectionClasses();
    setSelections([]);
    setFontMode(nextMode);
    setPanelOpen(nextMode === "multi");
    setSubmenuOpen(false);
    setNotice(nextMode === "single" ? "SINGLE FONT: click one text item." : "MULTI FONT: click every text item you want to change.");

    // Font picking is its own editing mode. Put the main Q editor back into
    // READ ONLY first so a text click cannot open both editors at once.
    const readOnly = Array.from(document.querySelectorAll<HTMLButtonElement>(".q-site-menu button"))
      .find((button) => button.textContent?.trim() === "READ ONLY");
    readOnly?.click();
  }

  function cancelFontMode() {
    removeSelectionClasses();
    setSelections([]);
    setPanelOpen(false);
    setFontMode(null);
    setNotice("Font selection cancelled.");
  }

  function applySelectedFont() {
    if (!selections.length) {
      setNotice("Select at least one text item first.");
      return;
    }
    if (!parsed || !family) {
      setNotice("Paste a valid Google Fonts link block and choose a font family.");
      return;
    }

    const storedInput = reorderedFontInput(fontInput, family);
    const storedFont = parseFontInput(storedInput);
    if (!storedFont) {
      setNotice("That Google Fonts block could not be read.");
      return;
    }

    const drafts = loadDraftMap();
    for (const selected of selections) {
      const identity: FontIdentity = {
        record: selected.record,
        product: selected.product,
        order: selected.order,
        field: selected.field,
      };
      const field = fontDraftField(identity);
      const draft: StoredDraft = {
        record: "page_text",
        product: FONT_PRODUCT,
        field,
        kind: "text",
        value: storedInput,
      };
      const key = [draft.record, draft.product || "", "", draft.field].join("|");
      drafts[key] = draft;
      applyFont(identity, storedFont);
    }
    saveDraftMap(drafts);

    const count = selections.length;
    removeSelectionClasses();
    setSelections([]);
    setPanelOpen(false);
    setFontMode(null);
    setNotice(`${family} saved locally for ${count} text item${count === 1 ? "" : "s"}. Q → PUBLISH when ready.`);
  }

  const fontMenu = menuHost ? createPortal(
    <div
      className="q-font-menu-entry"
      onMouseEnter={() => setSubmenuOpen(true)}
      onMouseLeave={() => setSubmenuOpen(false)}
    >
      <button type="button" onClick={() => setSubmenuOpen((value) => !value)} aria-haspopup="menu" aria-expanded={submenuOpen}>
        <span>FONT</span><span aria-hidden="true">›</span>
      </button>
      <div className={`q-font-submenu ${submenuOpen ? "is-open" : ""}`} role="menu" aria-label="Font mode">
        <button type="button" onClick={() => beginFontMode("single")}>SINGLE</button>
        <button type="button" onClick={() => beginFontMode("multi")}>MULTI</button>
      </div>
    </div>,
    menuHost,
  ) : null;

  return (
    <>
      {fontMenu}

      {panelOpen ? (
        <div className="q-font-panel" role="dialog" aria-label={`${fontMode === "multi" ? "Multi" : "Single"} font editor`}>
          <div className="q-font-panel-heading">
            <strong>{fontMode === "multi" ? "MULTI FONT" : "SINGLE FONT"}</strong>
            <span>{selections.length} SELECTED</span>
          </div>
          <label>
            <span>GOOGLE FONTS BLOCK</span>
            <textarea
              value={fontInput}
              onChange={(event) => setFontInput(event.target.value)}
              rows={7}
              placeholder={'Paste the complete <link rel="preconnect" ...> and <link href="https://fonts.googleapis.com/..."> block here.'}
            />
          </label>
          <label>
            <span>FONT FAMILY</span>
            <select value={family} onChange={(event) => setFamily(event.target.value)} disabled={!parsed?.families.length}>
              {!parsed?.families.length ? <option value="">Paste a Google Fonts block first</option> : null}
              {parsed?.families.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          {fontMode === "multi" ? <small>Keep clicking text on the page to add or remove it from this batch.</small> : null}
          <div className="q-font-panel-actions">
            <button type="button" onClick={cancelFontMode}>Cancel</button>
            <button type="button" onClick={applySelectedFont} disabled={!selections.length || !parsed || !family}>Apply</button>
          </div>
        </div>
      ) : null}

      {notice ? <button type="button" className="q-font-notice" onClick={() => setNotice("")}>{notice}</button> : null}
    </>
  );
}
