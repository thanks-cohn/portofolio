#!/usr/bin/env python3
"""Release entrypoint for the complete Quandranea visual CMS."""

from __future__ import annotations

import sys
import tkinter as tk
from pathlib import Path
from tkinter import ttk

from portfolio_builder import widget_set
from portfolio_builder_complete import FIXED_NAV_FIELDS, FIXED_PAGES
from portfolio_builder_complete_final import FinalCompletePortfolioBuilder


class ReleasePortfolioBuilder(FinalCompletePortfolioBuilder):
    def load_file(self, path: Path) -> None:
        super().load_file(path)
        if not self.fieldnames or not self.block_indices:
            return

        # Repair the accidental migration state where every fixed-page menu label
        # became HOME. The original first block still carries the intended legacy
        # labels, so use those as the safe recovery source.
        first = self.rows[self.block_indices[0]]
        home_label = (first.get("nav_home_label") or "HOME").strip()
        current = []
        for page_key in FIXED_PAGES:
            index = self._route_row_index(page_key)
            if index is None:
                continue
            current.append((page_key, index, (self.rows[index].get("nav_label") or "").strip()))

        duplicated_home = (
            len(current) >= 2
            and home_label
            and all(label.casefold() == home_label.casefold() for _page, _index, label in current)
        )
        if duplicated_home:
            for page_key, index, _label in current:
                label_field, _url_field = FIXED_NAV_FIELDS[page_key]
                restored = (first.get(label_field) or page_key.upper()).strip()
                self.rows[index]["nav_label"] = restored
                vars_ = self.route_vars.get(page_key)
                if vars_ is not None:
                    vars_["label"].set(restored)
            self.status_text.set("Repaired duplicated HOME labels in the top menu")

    def _build_section_card(self, parent: ttk.Frame, row_index: int) -> None:
        super()._build_section_card(parent, row_index)
        widgets = self.section_widgets.get(row_index)
        if not widgets:
            return
        card = widgets.get("image_url").master
        for child in self._walk(card):
            if isinstance(child, ttk.Label) and child.cget("text") == "Google Font URL":
                child.configure(text="Google Font (URL or copied <link> block)")

        for logical in ("header_font_url", "subheader_font_url", "body_font_url"):
            widget = widgets.get(logical)
            if not isinstance(widget, ttk.Entry):
                continue

            def paste(_event=None, w=widget):
                try:
                    widget_set(w, self.clipboard_get())
                    return "break"
                except tk.TclError:
                    return None

            widget.bind("<Control-v>", paste)
            widget.bind("<Control-V>", paste)
            widget.bind("<<Paste>>", paste)


def main() -> None:
    initial = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else None
    ReleasePortfolioBuilder(initial).mainloop()


if __name__ == "__main__":
    main()
