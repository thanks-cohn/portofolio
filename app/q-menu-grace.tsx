"use client";

import { useEffect } from "react";

const GRACE_MS = 5_000;

export function QMenuGrace() {
  useEffect(() => {
    const attached = new WeakSet<HTMLElement>();
    const timers = new WeakMap<HTMLElement, number>();
    const allowNextLeave = new WeakSet<HTMLElement>();

    const attachGrace = (element: HTMLElement) => {
      if (attached.has(element)) return;
      attached.add(element);

      const cancelClose = () => {
        const timer = timers.get(element);
        if (timer !== undefined) window.clearTimeout(timer);
        timers.delete(element);
      };

      const onMouseOver = () => cancelClose();

      const onMouseOut = (event: MouseEvent) => {
        const next = event.relatedTarget;
        if (next instanceof Node && element.contains(next)) return;

        if (allowNextLeave.has(element)) {
          allowNextLeave.delete(element);
          return;
        }

        // The original Q components close immediately on mouse leave. Stop that
        // delegated React event here, then replay one only after the grace period.
        event.stopPropagation();
        cancelClose();
        const timer = window.setTimeout(() => {
          timers.delete(element);
          if (!element.isConnected) return;
          allowNextLeave.add(element);
          element.dispatchEvent(new MouseEvent("mouseout", {
            bubbles: true,
            cancelable: true,
            relatedTarget: document.body,
          }));
        }, GRACE_MS);
        timers.set(element, timer);
      };

      element.addEventListener("mouseover", onMouseOver);
      element.addEventListener("mouseout", onMouseOut);
    };

    const scan = () => {
      document.querySelectorAll<HTMLElement>(".q-site-menu, .q-font-menu-entry").forEach(attachGrace);
    };

    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
