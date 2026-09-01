"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const GRACE_MS = 7_000;

export function QFontMenuBridge() {
  const [menuHost, setMenuHost] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const choiceTimer = useRef<number | null>(null);

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

  // QSiteEditor owns the parent menu and still has a React onMouseLeave that
  // closes immediately. FONT is rendered into that menu through a portal, so
  // React can falsely treat Q-menu -> FONT as leaving the parent component even
  // though FONT is physically inside the menu in the DOM. Guard the ACTUAL live
  // menu here. Internal transitions never reach React's false leave handler;
  // genuine outside exits are replayed only after seven seconds.
  useEffect(() => {
    if (!menuHost) return;

    let closeTimer: number | null = null;
    let replaying = false;

    const cancelClose = () => {
      if (closeTimer !== null) window.clearTimeout(closeTimer);
      closeTimer = null;
    };

    const onMouseOver = () => cancelClose();

    const onMouseOut = (event: MouseEvent) => {
      if (replaying) {
        replaying = false;
        return;
      }

      const next = event.relatedTarget;
      if (next instanceof Node && menuHost.contains(next)) {
        event.stopPropagation();
        event.stopImmediatePropagation();
        cancelClose();
        return;
      }

      event.stopPropagation();
      event.stopImmediatePropagation();
      cancelClose();
      closeTimer = window.setTimeout(() => {
        closeTimer = null;
        if (!menuHost.isConnected) return;
        replaying = true;
        menuHost.dispatchEvent(new MouseEvent("mouseout", {
          bubbles: true,
          cancelable: true,
          relatedTarget: document.body,
        }));
      }, GRACE_MS);
    };

    menuHost.addEventListener("mouseover", onMouseOver, true);
    menuHost.addEventListener("mouseout", onMouseOut, true);

    return () => {
      cancelClose();
      menuHost.removeEventListener("mouseover", onMouseOver, true);
      menuHost.removeEventListener("mouseout", onMouseOut, true);
    };
  }, [menuHost]);

  function cancelChoiceClose() {
    if (choiceTimer.current !== null) window.clearTimeout(choiceTimer.current);
    choiceTimer.current = null;
  }

  function scheduleChoiceClose() {
    cancelChoiceClose();
    choiceTimer.current = window.setTimeout(() => {
      choiceTimer.current = null;
      setOpen(false);
    }, GRACE_MS);
  }

  useEffect(() => () => cancelChoiceClose(), []);

  function choose(mode: "SINGLE" | "MULTI") {
    const stableButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".q-font-menu-entry-stable .q-font-submenu button"),
    );
    const target = stableButtons.find((button) => button.textContent?.trim() === mode);
    if (!target) return;
    cancelChoiceClose();
    setOpen(false);
    target.click();
  }

  if (!menuHost) return null;

  return createPortal(
    <div
      className="q-font-inline-entry"
      onMouseEnter={() => {
        cancelChoiceClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleChoiceClose}
    >
      <button
        type="button"
        className="q-font-inline-trigger"
        onClick={() => {
          cancelChoiceClose();
          setOpen((value) => !value);
        }}
        aria-expanded={open}
      >
        <span>FONT</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <div
          className="q-font-inline-choices"
          role="group"
          aria-label="Font mode"
          onMouseEnter={cancelChoiceClose}
          onMouseLeave={scheduleChoiceClose}
        >
          <button type="button" onClick={() => choose("SINGLE")}>SINGLE</button>
          <button type="button" onClick={() => choose("MULTI")}>MULTI</button>
        </div>
      ) : null}
    </div>,
    menuHost,
  );
}
