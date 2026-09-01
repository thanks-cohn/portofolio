"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function QFontMenuBridge() {
  const [menuHost, setMenuHost] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const refresh = () => {
      const next = document.querySelector<HTMLElement>(".q-site-menu");
      setMenuHost((current) => current === next ? current : next);
      if (!next) setOpen(false);
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  function choose(mode: "SINGLE" | "MULTI") {
    const stableButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".q-font-menu-entry-stable .q-font-submenu button"),
    );
    const target = stableButtons.find((button) => button.textContent?.trim() === mode);
    if (!target) return;
    setOpen(false);
    target.click();
  }

  if (!menuHost) return null;

  return createPortal(
    <div className="q-font-inline-entry">
      <button
        type="button"
        className="q-font-inline-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>FONT</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <div className="q-font-inline-choices" role="group" aria-label="Font mode">
          <button type="button" onClick={() => choose("SINGLE")}>SINGLE</button>
          <button type="button" onClick={() => choose("MULTI")}>MULTI</button>
        </div>
      ) : null}
    </div>,
    menuHost,
  );
}
