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
type SolidColor = { mode: "solid"; value: string };
type GradientColor = { mode: "gradient"; start: string; end: string; angle: number };
type TextColor = SolidColor | GradientColor;
type TextSize = { mode: "h1" | "h2" | "h3" | "custom"; px?: number };
type TypographyStyle = { font?: ParsedFont; color?: TextColor; size?: TextSize };
type StoredDraft = { record: string; product?: string; order?: string; field: string; kind?: string; value: string };
type PublishedTypography = { target: FontIdentity; style: TypographyStyle };
type StoredPayload = {
  v?: number;
  revert?: boolean;
  fontInput?: string;
  fontFamily?: string;
  color?: TextColor;
  size?: TextSize;
};

type BaseProperty = { value: string; priority: string };
type BaseStyle = Record<string, BaseProperty>;

const STYLE_PROPERTIES = [
  "font-family",
  "font-size",
  "color",
  "background-image",
  "background-clip",
  "-webkit-background-clip",
  "-webkit-text-fill-color",
] as const;

const PRESET_SIZES: Record<Exclude<TextSize["mode"], "custom">, string> = {
  h1: "2em",
  h2: "1.5em",
  h3: "1.17em",
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

function decodePart(value: string) {
  try { return decodeURIComponent(value || ""); } catch { return value || ""; }
}

function typographyDraftField(target: FontIdentity) {
  return ["font", target.record, target.product, target.order, target.field].map(encodePart).join("::");
}

function targetFromTypographyDraft(field: string): FontIdentity | null {
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

function styleFromPayload(value: string): { style?: TypographyStyle; revert?: boolean } | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as StoredPayload;
    if (payload?.revert) return { revert: true };
    const style: TypographyStyle = {};
    if (payload.fontInput) {
      const parsed = parseFontInput(payload.fontInput);
      if (parsed) {
        const chosen = payload.fontFamily && parsed.families.includes(payload.fontFamily)
          ? payload.fontFamily
          : parsed.family;
        style.font = { ...parsed, family: chosen };
      }
    }
    if (payload.color?.mode === "solid" && payload.color.value) {
      style.color = { mode: "solid", value: payload.color.value };
    } else if (payload.color?.mode === "gradient" && payload.color.start && payload.color.end) {
      style.color = {
        mode: "gradient",
        start: payload.color.start,
        end: payload.color.end,
        angle: Number.isFinite(Number(payload.color.angle)) ? Number(payload.color.angle) : 90,
      };
    }
    if (payload.size && ["h1", "h2", "h3", "custom"].includes(payload.size.mode)) {
      if (payload.size.mode === "custom") {
        const px = Number(payload.size.px);
        if (Number.isFinite(px) && px > 0) style.size = { mode: "custom", px };
      } else {
        style.size = { mode: payload.size.mode };
      }
    }
    return Object.keys(style).length ? { style } : null;
  } catch {
    const legacyFont = parseFontInput(raw);
    return legacyFont ? { style: { font: legacyFont } } : null;
  }
}

function payloadFromStyle(style: TypographyStyle): string {
  const payload: StoredPayload = { v: 1 };
  if (style.font) {
    payload.fontInput = style.font.raw || style.font.href;
    payload.fontFamily = style.font.family;
  }
  if (style.color) payload.color = style.color;
  if (style.size) payload.size = style.size;
  return JSON.stringify(payload);
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

function captureBase(node: HTMLElement) {
  if (node.dataset.qTypographyBase) return;
  const base: BaseStyle = {};
  for (const property of STYLE_PROPERTIES) {
    base[property] = {
      value: node.style.getPropertyValue(property),
      priority: node.style.getPropertyPriority(property),
    };
  }
  node.dataset.qTypographyBase = JSON.stringify(base);
}

function restoreNode(node: HTMLElement) {
  captureBase(node);
  let base: BaseStyle = {};
  try { base = JSON.parse(node.dataset.qTypographyBase || "{}") as BaseStyle; } catch { base = {}; }
  for (const property of STYLE_PROPERTIES) {
    const saved = base[property];
    if (saved?.value) node.style.setProperty(property, saved.value, saved.priority || "");
    else node.style.removeProperty(property);
  }
}

function restoreTarget(target: FontIdentity) {
  document.querySelectorAll<HTMLElement>(selectorForTarget(target)).forEach(restoreNode);
}

function applyTypography(target: FontIdentity, style: TypographyStyle) {
  if (style.font?.href) ensureFontLink(style.font.href);
  document.querySelectorAll<HTMLElement>(selectorForTarget(target)).forEach((node) => {
    restoreNode(node);
    if (style.font?.family) {
      const safeFamily = style.font.family.replace(/'/g, "\\'");
      node.style.setProperty("font-family", `'${safeFamily}', sans-serif`, "important");
    }
    if (style.size) {
      const value = style.size.mode === "custom"
        ? `${Math.max(1, Number(style.size.px) || 1)}px`
        : PRESET_SIZES[style.size.mode];
      node.style.setProperty("font-size", value, "important");
    }
    if (style.color?.mode === "solid") {
      node.style.setProperty("color", style.color.value, "important");
    } else if (style.color?.mode === "gradient") {
      const gradient = `linear-gradient(${style.color.angle}deg, ${style.color.start}, ${style.color.end})`;
      node.style.setProperty("background-image", gradient, "important");
      node.style.setProperty("background-clip", "text", "important");
      node.style.setProperty("-webkit-background-clip", "text", "important");
      node.style.setProperty("-webkit-text-fill-color", "transparent", "important");
      node.style.setProperty("color", "transparent", "important");
    }
  });
}

function publishedTypography(): PublishedTypography[] {
  const next = (truthData as unknown as { q_typography?: PublishedTypography[] }).q_typography || [];
  if (next.length) return next.filter((item) => item?.target?.record && item?.target?.field && item?.style);

  const legacy = (truthData as unknown as { q_fonts?: Array<{ target: FontIdentity; font: ParsedFont }> }).q_fonts || [];
  return legacy.map((item) => ({ target: item.target, style: { font: item.font } }));
}

function draftTypography() {
  return Object.values(loadDraftMap()).flatMap((draft) => {
    if (draft.record !== "page_text" || draft.product !== FONT_PRODUCT || !draft.field.startsWith("font::")) return [];
    const target = targetFromTypographyDraft(draft.field);
    const parsed = styleFromPayload(draft.value);
    return target && parsed ? [{ target, ...parsed }] : [];
  });
}

function currentTypographyMap() {
  const map = new Map<string, TypographyStyle>();
  publishedTypography().forEach((item) => map.set(targetId(item.target), item.style));
  draftTypography().forEach((item) => {
    if (item.revert) map.delete(targetId(item.target));
    else if (item.style) map.set(targetId(item.target), item.style);
  });
  return map;
}

function applyAllTypography() {
  publishedTypography().forEach((item) => applyTypography(item.target, item.style));
  draftTypography().forEach((item) => {
    if (item.revert) restoreTarget(item.target);
    else if (item.style) applyTypography(item.target, item.style);
  });
}

function clearSelectionClasses() {
  document.querySelectorAll<HTMLElement>(".q-font-selected").forEach((node) => node.classList.remove("q-font-selected"));
}

function isValidColor(value: string) {
  return Boolean(value.trim()) && CSS.supports("color", value.trim());
}

function safeHex(value: string, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : fallback;
}

export function QFontEditorStable() {
  const [menuHost, setMenuHost] = useState<HTMLElement | null>(null);
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const [fontMode, setFontMode] = useState<FontMode | null>(null);
  const [selections, setSelections] = useState<FontTarget[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [fontInput, setFontInput] = useState("");
  const [family, setFamily] = useState("");
  const [colorMode, setColorMode] = useState<"keep" | "solid" | "gradient">("keep");
  const [solidCode, setSolidCode] = useState("#f1eee7");
  const [solidPicker, setSolidPicker] = useState("#f1eee7");
  const [gradientStart, setGradientStart] = useState("#ff4fa3");
  const [gradientEnd, setGradientEnd] = useState("#8b5cff");
  const [gradientStartPicker, setGradientStartPicker] = useState("#ff4fa3");
  const [gradientEndPicker, setGradientEndPicker] = useState("#8b5cff");
  const [gradientAngle, setGradientAngle] = useState("90");
  const [sizeMode, setSizeMode] = useState<"keep" | "h1" | "h2" | "h3" | "custom">("keep");
  const [customSize, setCustomSize] = useState("48");
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
    applyAllTypography();
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        applyAllTypography();
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
    setColorMode("keep");
    setSizeMode("keep");
    setNotice(nextMode === "single" ? "SINGLE TYPE: click one text item." : "MULTI TYPE: click every text item you want to change.");

    const readOnly = Array.from(document.querySelectorAll<HTMLButtonElement>(".q-site-menu button"))
      .find((button) => button.textContent?.trim() === "READ ONLY");
    readOnly?.click();
  }

  function cancelFontMode() {
    clearSelectionClasses();
    setSelections([]);
    setPanelOpen(false);
    setFontMode(null);
    setNotice("Typography selection cancelled.");
  }

  function storeDraft(target: FontIdentity, value: string) {
    const drafts = loadDraftMap();
    const field = typographyDraftField(target);
    const draft: StoredDraft = {
      record: "page_text",
      product: FONT_PRODUCT,
      field,
      kind: "text",
      value,
    };
    drafts[[draft.record, draft.product || "", "", draft.field].join("|")] = draft;
    saveDraftMap(drafts);
  }

  function applySelectedTypography() {
    if (!selections.length) {
      setNotice("Select at least one text item first.");
      return;
    }

    let chosenFont: ParsedFont | undefined;
    if (fontInput.trim()) {
      const currentParsed = parseFontInput(fontInput);
      if (!currentParsed) {
        setNotice("I could not read that Google Fonts block.");
        return;
      }
      const selectedFamily = family || currentParsed.families[0];
      chosenFont = { ...currentParsed, family: selectedFamily };
    }

    let chosenColor: TextColor | undefined;
    if (colorMode === "solid") {
      if (!isValidColor(solidCode)) {
        setNotice("That solid color code is not valid CSS.");
        return;
      }
      chosenColor = { mode: "solid", value: solidCode.trim() };
    } else if (colorMode === "gradient") {
      if (!isValidColor(gradientStart) || !isValidColor(gradientEnd)) {
        setNotice("One of the gradient color codes is not valid CSS.");
        return;
      }
      const angle = Number(gradientAngle);
      if (!Number.isFinite(angle)) {
        setNotice("Gradient angle must be a number.");
        return;
      }
      chosenColor = { mode: "gradient", start: gradientStart.trim(), end: gradientEnd.trim(), angle };
    }

    let chosenSize: TextSize | undefined;
    if (sizeMode === "custom") {
      const px = Number(customSize);
      if (!Number.isFinite(px) || px <= 0 || px > 500) {
        setNotice("Custom size must be between 1 and 500 pixels.");
        return;
      }
      chosenSize = { mode: "custom", px };
    } else if (sizeMode !== "keep") {
      chosenSize = { mode: sizeMode };
    }

    if (!chosenFont && !chosenColor && !chosenSize) {
      setNotice("Choose a font, color, gradient, or size change first.");
      return;
    }

    const current = currentTypographyMap();
    for (const selected of selections) {
      const identity: FontIdentity = {
        record: selected.record,
        product: selected.product,
        order: selected.order,
        field: selected.field,
      };
      const style: TypographyStyle = { ...(current.get(targetId(identity)) || {}) };
      if (chosenFont) style.font = chosenFont;
      if (chosenColor) style.color = chosenColor;
      if (chosenSize) style.size = chosenSize;
      storeDraft(identity, payloadFromStyle(style));
      applyTypography(identity, style);
    }

    const count = selections.length;
    clearSelectionClasses();
    setSelections([]);
    setPanelOpen(false);
    setFontMode(null);
    setNotice(`Typography saved locally for ${count} text item${count === 1 ? "" : "s"}. Q → PUBLISH when ready.`);
  }

  function revertSelectedTypography() {
    if (!selections.length) {
      setNotice("Select at least one text item to revert.");
      return;
    }
    for (const selected of selections) {
      const identity: FontIdentity = {
        record: selected.record,
        product: selected.product,
        order: selected.order,
        field: selected.field,
      };
      storeDraft(identity, JSON.stringify({ v: 1, revert: true }));
      restoreTarget(identity);
    }
    const count = selections.length;
    clearSelectionClasses();
    setSelections([]);
    setPanelOpen(false);
    setFontMode(null);
    setNotice(`Revert saved locally for ${count} text item${count === 1 ? "" : "s"}. Q → PUBLISH to make it permanent.`);
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
        aria-label="Typography mode"
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
        <div className="q-font-panel" role="dialog" aria-label={`${fontMode === "multi" ? "Multi" : "Single"} typography editor`}>
          <div className="q-font-panel-heading">
            <strong>{fontMode === "multi" ? "MULTI TYPE" : "SINGLE TYPE"}</strong>
            <span>{selections.length} SELECTED</span>
          </div>

          <label>
            <span>GOOGLE FONTS BLOCK · OPTIONAL</span>
            <textarea
              value={fontInput}
              onChange={(event) => setFontInput(event.target.value)}
              rows={5}
              placeholder={'Paste the complete <link rel="preconnect" ...> and <link href="https://fonts.googleapis.com/..."> block here.'}
            />
          </label>

          <label>
            <span>FONT FAMILY</span>
            <select value={family} onChange={(event) => setFamily(event.target.value)} disabled={!parsed?.families.length}>
              {!parsed?.families.length ? <option value="">Keep current font</option> : null}
              {parsed?.families.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>

          <label>
            <span>COLOR</span>
            <select value={colorMode} onChange={(event) => setColorMode(event.target.value as typeof colorMode)}>
              <option value="keep">KEEP CURRENT</option>
              <option value="solid">SOLID</option>
              <option value="gradient">GRADIENT</option>
            </select>
          </label>

          {colorMode === "solid" ? (
            <div className="q-font-color-row">
              <label>
                <span>PICKER</span>
                <input
                  type="color"
                  value={safeHex(solidPicker, "#f1eee7")}
                  onChange={(event) => {
                    setSolidPicker(event.target.value);
                    setSolidCode(event.target.value);
                  }}
                />
              </label>
              <label className="q-font-code-field">
                <span>COLOR CODE</span>
                <input type="text" value={solidCode} onChange={(event) => setSolidCode(event.target.value)} placeholder="#ff4fa3 or rgb(...)" />
              </label>
            </div>
          ) : null}

          {colorMode === "gradient" ? (
            <div className="q-font-gradient-grid">
              <label>
                <span>START PICKER</span>
                <input
                  type="color"
                  value={safeHex(gradientStartPicker, "#ff4fa3")}
                  onChange={(event) => {
                    setGradientStartPicker(event.target.value);
                    setGradientStart(event.target.value);
                  }}
                />
              </label>
              <label className="q-font-code-field">
                <span>START CODE</span>
                <input type="text" value={gradientStart} onChange={(event) => setGradientStart(event.target.value)} placeholder="#ff4fa3" />
              </label>
              <label>
                <span>END PICKER</span>
                <input
                  type="color"
                  value={safeHex(gradientEndPicker, "#8b5cff")}
                  onChange={(event) => {
                    setGradientEndPicker(event.target.value);
                    setGradientEnd(event.target.value);
                  }}
                />
              </label>
              <label className="q-font-code-field">
                <span>END CODE</span>
                <input type="text" value={gradientEnd} onChange={(event) => setGradientEnd(event.target.value)} placeholder="#8b5cff" />
              </label>
              <label className="q-font-angle-field">
                <span>ANGLE °</span>
                <input type="number" value={gradientAngle} onChange={(event) => setGradientAngle(event.target.value)} />
              </label>
              <div
                className="q-font-gradient-preview"
                aria-label="Gradient preview"
                style={{ backgroundImage: `linear-gradient(${Number(gradientAngle) || 0}deg, ${gradientStart}, ${gradientEnd})` }}
              />
            </div>
          ) : null}

          <label>
            <span>SIZE / PRESET</span>
            <select value={sizeMode} onChange={(event) => setSizeMode(event.target.value as typeof sizeMode)}>
              <option value="keep">KEEP CURRENT</option>
              <option value="h1">H1</option>
              <option value="h2">H2</option>
              <option value="h3">H3</option>
              <option value="custom">CUSTOM SIZE</option>
            </select>
          </label>

          {sizeMode === "custom" ? (
            <label>
              <span>CUSTOM SIZE (PX)</span>
              <input type="number" min="1" max="500" step="1" value={customSize} onChange={(event) => setCustomSize(event.target.value)} />
            </label>
          ) : null}

          {fontMode === "multi" ? <small>Keep clicking text on the page to add or remove it from this batch.</small> : null}
          <small>REVERT removes all Q typography overrides from the selected text and restores its underlying site style.</small>

          <div className="q-font-panel-actions">
            <button type="button" onClick={cancelFontMode}>Cancel</button>
            <button type="button" className="q-font-revert" onClick={revertSelectedTypography}>Revert</button>
            <button type="button" onClick={applySelectedTypography}>Apply</button>
          </div>
        </div>
      ) : null}

      {notice ? <button type="button" className="q-font-notice" onClick={() => setNotice("")}>{notice}</button> : null}
    </>
  );
}
