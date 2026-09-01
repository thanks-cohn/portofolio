"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import truthData from "../data/truth.generated.json";

const DRAFT_KEY = "quandranea-site-editor-drafts-v1";
const FONT_PRODUCT = "q-fonts";
const SUBMENU_GRACE_MS = 7_000;

type FontMode = "single" | "multi";
type FontIdentity = { record: string; product: string; order: string; field: string };
type FontTarget = FontIdentity & { element: HTMLElement };
type ParsedFont = { href: string; family: string; families: string[]; raw: string };
type StoredDraft = { record: string; product?: string; order?: string; field: string; kind?: string; value: string };
type PublishedFont = { target: FontIdentity; font: ParsedFont };

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

function decodePart(value: string) {
  try { return decodeURIComponent(value || ""); } catch { return value || ""; }
}

function fontDraftField(target: FontIdentity) {
  return ["font", target.record, target.product, target.order, target.field].map(encodePart).join("::");
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

  const htmlMatches = [...raw.matchAll(/href\s*=\s*["'](https:\/\/fonts\.googleapis\.com\/[^"']+)["']/gi)];
  let href = htmlMatches.length ? htmlMatches[htmlMatches.length - 1][1] : "";
  if (!href) {
    const urlMatches = [...raw.matchAll(/https:\/\/fonts\.googleapis\.com\/[^\s"'<>]+/gi)];
    href = urlMatches.length ? urlMatches[urlMatches.length - 1][0] : "";
  }
  href = href.replace(/&amp;/g, "&");
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
    ordered.forEach((spec) => url.searchParams.append("family", spec));
    const href = url.toString();
    const hrefPattern = /(href\s*=\s*["'])(https:\/\/fonts\.googleapis\.com\/[^"']+)(["'])/i;
    if (hrefPattern.test(raw)) return raw.replace(hrefPattern, (_all, before, _old, after) => `${before}${href}${after}`);
    return href;
  } catch {
    return raw.trim();
  }
}

function selectorForTarget(target: FontIdentity) {
  const parts = [
    '[data-q-edit="text"]',
    `[data-q-record="${CSS.escape(target.record)}"]`,
    `[data-q-field="${CSS.escape(target.field)}"]`,
  ];
  if (target.product) parts.push(`[data-q-product="${CSS.escape(target.product)}"]`);
  if (target.order) parts.push(`[data-q-order="${CSS.escape(target.order)}"]`);
  return parts.join("");
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
  publishedFonts().forEach((item) => applyFont(item.target, item.font));
  draftFonts().forEach((item) => applyFont(item.target, item.font));
}

function clearSelectionClasses() {
  document.querySelectorAll<HTMLElement>(".q-font-selected").forEach((node) => node.classList.remove("q-font-selected"));
}

export function QFontEditorStable() {
  const [menuHost, setMenuHost] = useState<HTMLElement | null>(null);
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const [fontMode, setFontMode] = useState<FontMode | null>(null);
  const [selections, setSelections] = useState<FontTarget[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [fontInput, setFontInput] = useState("");
  const [family, setFamily] = useState("");
  const [notice, setNotice] = useState("");
  const submenuTimer = useRef<number | null>(null);

  const parsed = useMemo(() => parseFontInput(fontInput), [fontInput]);

  function cancelSubmenuClose() {
    if (submenuTimer.current !== null) window.clearTimeout(submenuTimer.current);
    submenuTimer.current = null;
  }

  function scheduleSubmenuClose() {
    cancelSubmenuClose();
    submenuTimer.current = window.setTimeout(() => {
      submenuTimer.current = null;
      setSubmenuOpen(false);
    }, SUBMENU_GRACE_MS);
  }

  useEffect(() => {
    if (!parsed?.families.length) {
      setFamily("");
      return;
    }
    if (!parsed.families.includes(family)) setFamily(parsed.families[0]);
  }, [parsed, family]);

  useEffect(() => {
    const refresh = () => setMenuHost(document.querySelector<HTMLElement>(".q-site-menu"));
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    applyAllFonts();
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        applyAllFonts();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      cancelSubmenuClose();
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("q-font-picking", Boolean(fontMode));
    if (!fontMode) clearSelectionClasses();
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
        clearSelectionClasses();
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

    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, [fontMode]);

  function beginFontMode(nextMode: FontMode) {
    cancelSubmenuClose();
    clearSelectionClasses();
    setSelections([]);
    setFontMode(nextMode);
    setPanelOpen(nextMode === "multi");
    setSubmenuOpen(false);
    setNotice(nextMode === "single" ? "SINGLE FONT: click one text item." : "MULTI FONT: click every text item you want to change.");

    const readOnly = Array.from(document.querySelectorAll<HTMLButtonElement>(".q-site-menu button"))
      .find((button) => button.textContent?.trim() === "READ ONLY");
    readOnly?.click();
  }

  function cancelFontMode() {
    clearSelectionClasses();
    setSelections([]);
    setPanelOpen(false);
    setFontMode(null);
    setNotice("Font selection cancelled.");
  }

  function applySelectedFont() {
    const currentParsed = parseFontInput(fontInput);
    const selectedFamily = family || currentParsed?.families[0] || "";

    if (!selections.length) {
      setNotice("Select at least one text item first.");
      return;
    }
    if (!currentParsed) {
      setNotice("I could not read that Google Fonts block. Paste the complete fonts.googleapis.com <link> block.");
      return;
    }
    if (!selectedFamily) {
      setNotice("Choose a font family first.");
      return;
    }

    const storedInput = reorderedFontInput(fontInput, selectedFamily);
    const storedFont = parseFontInput(storedInput);
    if (!storedFont) {
      setNotice("That Google Fonts block could not be saved.");
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
      drafts[[draft.record, draft.product || "", "", draft.field].join("|")] = draft;
      applyFont(identity, { ...storedFont, family: selectedFamily });
    }
    saveDraftMap(drafts);

    const count = selections.length;
    clearSelectionClasses();
    setSelections([]);
    setPanelOpen(false);
    setFontMode(null);
    setNotice(`${selectedFamily} saved locally for ${count} text item${count === 1 ? "" : "s"}. Q → PUBLISH when ready.`);
  }

  const fontMenu = menuHost ? createPortal(
    <div
      className="q-font-menu-entry q-font-menu-entry-stable"
      onMouseEnter={() => { cancelSubmenuClose(); setSubmenuOpen(true); }}
      onMouseLeave={scheduleSubmenuClose}
    >
      <button
        type="button"
        onClick={() => { cancelSubmenuClose(); setSubmenuOpen((value) => !value); }}
        aria-haspopup="menu"
        aria-expanded={submenuOpen}
      >
        <span>FONT</span><span aria-hidden="true">›</span>
      </button>
      <div
        className={`q-font-submenu ${submenuOpen ? "is-open" : ""}`}
        role="menu"
        aria-label="Font mode"
        onMouseEnter={cancelSubmenuClose}
        onMouseLeave={scheduleSubmenuClose}
      >
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
            <select value={family} onChange={(event) => setFamily(event.target.value)}>
              {!parsed?.families.length ? <option value="">Paste a Google Fonts block first</option> : null}
              {parsed?.families.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          {fontMode === "multi" ? <small>Keep clicking text on the page to add or remove it from this batch.</small> : null}
          <div className="q-font-panel-actions">
            <button type="button" onClick={cancelFontMode}>Cancel</button>
            <button type="button" onClick={applySelectedFont}>Apply</button>
          </div>
        </div>
      ) : null}

      {notice ? <button type="button" className="q-font-notice" onClick={() => setNotice("")}>{notice}</button> : null}
    </>
  );
}
