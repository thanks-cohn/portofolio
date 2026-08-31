#!/usr/bin/env python3
"""Release entrypoint for the complete Quandranea visual CMS."""

from __future__ import annotations

import sys
import tkinter as tk
from pathlib import Path
from tkinter import ttk

from portfolio_builder import widget_get, widget_set
from portfolio_builder_complete import FIXED_DEFAULT_ROUTES, FIXED_NAV_FIELDS, FIXED_PAGES
from portfolio_builder_complete_final import FinalCompletePortfolioBuilder

SECTION_LINK_COLUMN = "section_link_url"


class ReleasePortfolioBuilder(FinalCompletePortfolioBuilder):
    def load_file(self, path: Path) -> None:
        super().load_file(path)
        if not self.fieldnames or not self.block_indices:
            return

        # Section images can lead to any deployed page, including pages hidden
        # from the top menu. Keep this as a first-class CSV field instead of
        # overloading the existing font/style columns.
        if SECTION_LINK_COLUMN not in self.fieldnames:
            self.fieldnames.append(SECTION_LINK_COLUMN)
        for row in self.rows:
            row.setdefault(SECTION_LINK_COLUMN, "")
        self._rebuild_section_editors()

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

    def _known_page_routes(self) -> list[str]:
        routes: list[str] = []
        keys = [*FIXED_PAGES, *sorted(self.custom_page_keys)]
        for page_key in keys:
            index = self._route_row_index(page_key)
            if index is not None:
                row = self.rows[index]
                route = row.get("route_path") or row.get("destination_url")
            else:
                route = FIXED_DEFAULT_ROUTES.get(page_key, "")
            route = (route or "").strip()
            if route and route not in routes:
                routes.append(route)
        return routes

    def _build_section_card(self, parent: ttk.Frame, row_index: int) -> None:
        super()._build_section_card(parent, row_index)
        widgets = self.section_widgets.get(row_index)
        if not widgets:
            return
        image_widget = widgets.get("image_url")
        if image_widget is None:
            return
        card = image_widget.master

        # Make the alternating editorial layout wording self-explanatory.
        for child in card.grid_slaves():
            if isinstance(child, ttk.Label) and child.cget("text") == "Image side":
                child.configure(text="Image position")

        # An image may route to a hidden/custom page. The combobox suggests every
        # known page route but remains editable for an external or future URL.
        bottom_row = max((int(child.grid_info().get("row", 0)) for child in card.grid_slaves()), default=0) + 1
        ttk.Separator(card).grid(row=bottom_row, column=0, columnspan=3, sticky="ew", pady=(10, 8))
        ttk.Label(card, text="When this image is clicked →").grid(
            row=bottom_row + 1, column=0, sticky="w", padx=(0, 10), pady=4
        )
        link = ttk.Combobox(card, values=self._known_page_routes())
        link.grid(row=bottom_row + 1, column=1, columnspan=2, sticky="ew", pady=4)
        widget_set(link, self.rows[row_index].get(SECTION_LINK_COLUMN, "") or "")
        widgets[SECTION_LINK_COLUMN] = link
        ttk.Label(
            card,
            text="Choose any page route. The destination does not need to appear in the top menu.",
            foreground="#666",
        ).grid(row=bottom_row + 2, column=1, columnspan=2, sticky="w", pady=(0, 7))

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

    def _commit_sections(self) -> None:
        super()._commit_sections()
        if SECTION_LINK_COLUMN not in self.fieldnames:
            return
        for row_index, widgets in self.section_widgets.items():
            if row_index >= len(self.rows):
                continue
            widget = widgets.get(SECTION_LINK_COLUMN)
            if widget is not None:
                self.rows[row_index][SECTION_LINK_COLUMN] = widget_get(widget).strip()


def main() -> None:
    initial = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else None
    ReleasePortfolioBuilder(initial).mainloop()


if __name__ == "__main__":
    main()
