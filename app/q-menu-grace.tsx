"use client";

import { useEffect } from "react";

const GRACE_MS = 7_000;

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

        // FONT is mounted into the Q menu through a React portal. It is a real
        // DOM descendant, but React's synthetic enter/leave system can still
        // interpret the transition as leaving the parent component tree. When
        // the pointer is moving to ANY DOM descendant, swallow mouseout before
        // React can manufacture that false onMouseLeave. This is the critical
        // case for Q menu -> FONT and FONT -> SINGLE/MULTI.
        if (next instanceof Node && element.contains(next)) {
          event.stopPropagation();
          event.stopImmediatePropagation();
          cancelClose();
          return;
        }

        if (allowNextLeave.has(element)) {
          allowNextLeave.delete(element);
          return;
        }

        // A genuine exit gets the requested seven-second grace. React never
        // receives the original leave; one deliberate leave is replayed later.
        event.stopPropagation();
        event.stopImmediatePropagation();
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

      // Capture is critical: this must happen before React's delegated
      // enter/leave handling sees the native mouseout.
      element.addEventListener("mouseover", onMouseOver, true);
      element.addEventListener("mouseout", onMouseOut, true);
    };

    const scan = () => {
      document.querySelectorAll<HTMLElement>(
        ".q-site-menu, .q-font-menu-entry, .q-font-submenu",
      ).forEach(attachGrace);
    };

    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
