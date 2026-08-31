#!/usr/bin/env python3
"""Release entrypoint for the complete Quandranea visual CMS."""

from __future__ import annotations

import json
import sys
import tkinter as tk
from pathlib import Path
from tkinter import ttk

from portfolio_builder import widget_get, widget_set
from portfolio_builder_complete import FIXED_DEFAULT_ROUTES, FIXED_NAV_FIELDS, FIXED_PAGES
from portfolio_builder_complete_final import FinalCompletePortfolioBuilder

SECTION_LINK_COLUMN = "section_link_url"
SEED_PATH = Path(__file__).resolve().parents[1] / "data" / "portfolio-seed.json"


class ReleasePortfolioBuilder(FinalCompletePortfolioBuilder):
    def _seed_data(self) -> dict:
        try:
            return json.loads(SEED_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}

    def _page_text_index(self, page_key: str, field: str) -> int | None:
        for index, row in enumerate(self.rows):
            if row.get("record_type") != "page_text":
                continue
            if (row.get("product_id") or "").strip().lower() != page_key:
                continue
            if (row.get("title") or "").strip() == field:
                return index
        return None

    def _set_page_text_if_placeholder(self, page_key: str, field: str, value: str, placeholders: set[str]) -> None:
        index = self._page_text_index(page_key, field)
        if index is None:
            row = self._new_csv_row()
            row.update(record_type="page_text", product_id=page_key, title=field, description=value)
            self.rows.append(row)
            return
        current = (self.rows[index].get("description") or "").strip()
        if not current or current in placeholders:
            self.rows[index]["description"] = value

    def _ensure_hidden_page(self, item: dict) -> None:
        page_key = self._slug(str(item.get("key") or ""))
        if not page_key:
            return
        meta_index = next(
            (
                index
                for index, row in enumerate(self.rows)
                if row.get("record_type") == "page_meta" and self._slug(row.get("product_id", "")) == page_key
            ),
            None,
        )
        if meta_index is None:
            meta = self._new_csv_row()
            meta.update(
                record_type="page_meta",
                product_id=page_key,
                title=str(item.get("name") or item.get("title") or page_key.upper()),
                destination_url=str(item.get("path") or f"/{page_key}/"),
                route_path=str(item.get("path") or f"/{page_key}/"),
                route_aliases="",
                show_in_nav="true" if item.get("show_in_nav") else "false",
                nav_label=str(item.get("name") or item.get("title") or page_key.upper()).upper(),
                nav_order=str(self._next_nav_order()),
            )
            self.rows.append(meta)

        defaults = {
            "title": str(item.get("title") or page_key.upper()),
            "kicker": str(item.get("kicker") or "PROJECT"),
            "body": str(item.get("body") or "Add project details here."),
        }
        for field, value in defaults.items():
            if self._page_text_index(page_key, field) is None:
                row = self._new_csv_row()
                row.update(record_type="page_text", product_id=page_key, title=field, description=value)
                self.rows.append(row)

    def _ensure_props_sections(self, seed: dict) -> None:
        existing = [
            row
            for row in self.rows
            if row.get("record_type") == "page_section" and (row.get("product_id") or "").strip().lower() == "acting"
        ]
        if existing:
            return
        for item in seed.get("props", {}).get("sections", []):
            row = self._new_csv_row()
            row.update(
                record_type="page_section",
                product_id="acting",
                order=str(item.get("order") or ""),
                availability=str(item.get("image_side") or "left"),
                image_url=str(item.get("image_url") or ""),
                image_alt=str(item.get("image_alt") or "Page section image"),
                title=str(item.get("header") or ""),
                destination_label=str(item.get("subheader") or ""),
                description=str(item.get("body") or ""),
                font_scope=str(item.get("header_tag") or "h1"),
                font_product_id=str(item.get("subheader_tag") or "h3"),
                color_scope=str(item.get("body_tag") or "p"),
                text_color=str(item.get("header_color") or ""),
                color_product_id=str(item.get("subheader_color") or ""),
                footer_icon_ref=str(item.get("body_color") or ""),
                destination_url=str(item.get("header_font_url") or ""),
                footer_icon_label=str(item.get("subheader_font_url") or ""),
                footer_icon_url=str(item.get("body_font_url") or ""),
                header_size=str(item.get("header_size") or ""),
                subheader_size=str(item.get("subheader_size") or ""),
                body_size=str(item.get("body_size") or ""),
                section_link_url=str(item.get("image_link_url") or ""),
            )
            self.rows.append(row)

    def _apply_seed_defaults(self) -> None:
        seed = self._seed_data()
        if not seed or not self.block_indices:
            return

        first = self.rows[self.block_indices[0]]
        for field in ("nav_home_label", "nav_acting_label", "nav_design_label", "nav_resume_label", "nav_contact_label"):
            if first.get(field):
                first[field] = first[field].strip().upper()

        # Correct only known visible typos so later user-written copy is not overwritten.
        replacements = {
            "Carpentinng for Big love.": "Carpentry for Big Love.",
            "spring 2026": "Spring 2026",
        }
        title_replacements = {
            "Shakespears Twelfth Night": "Shakespeare's Twelfth Night",
            "Shakespeare Twelfth Night": "Shakespeare's Twelfth Night",
            "Prop Artist ( The servant of Two masters)": "Prop Artist (The Servant of Two Masters)",
        }
        for row_index in self.block_indices:
            row = self.rows[row_index]
            if row.get("title") in title_replacements:
                row["title"] = title_replacements[row["title"]]
            if row.get("description") in replacements:
                row["description"] = replacements[row["description"]]

        props = seed.get("props", {})
        self._set_page_text_if_placeholder("acting", "title", str(props.get("title") or "PROPS"), {"Props", "Props ", "ACTING"})
        self._set_page_text_if_placeholder("acting", "kicker", str(props.get("kicker") or "ARTIST / DESIGNER"), {"Artist/ Designer", "Performance"})
        self._set_page_text_if_placeholder(
            "acting",
            "body",
            str(props.get("body") or ""),
            {
                "All Things Props! As a Props Artist and designer , i love bringing stories to life through creative and hands on work. from building and painting to sourcing and designing.",
                "Selected acting work, performance credits, and material can live here. Replace this text with the work you want visitors to see.",
            },
        )

        contact_email = str(seed.get("contact_email") or "").strip()
        if contact_email:
            self._set_page_text_if_placeholder("contact", "email", contact_email, {"hello@example.com"})

        for item in seed.get("hidden_pages", []):
            self._ensure_hidden_page(item)
        self._ensure_props_sections(seed)

        heading_font = str(seed.get("landing", {}).get("row_heading_font") or "").strip()
        if heading_font:
            exists = any(
                row.get("record_type") == "font_input"
                and (row.get("product_id") or "").strip() == "site"
                and (row.get("title") or "").strip() == "row_heading"
                for row in self.rows
            )
            if not exists:
                row = self._new_csv_row()
                row.update(record_type="font_input", product_id="site", title="row_heading", description=heading_font)
                self.rows.append(row)

        for row in self.rows:
            if row.get("record_type") in {"page_route", "page_meta"} and row.get("nav_label"):
                row["nav_label"] = row["nav_label"].strip().upper()

        self._ensure_page_rows()
        self._ensure_page_style_rows()
        self._rebuild_custom_page_tabs()
        self._load_page_styles()
        self._rebuild_section_editors()
        self._load_route_widgets()
        self._load_font_vars()
        if self.current_block_position is not None:
            self._load_block(self.current_block_position)

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

        self._apply_seed_defaults()

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
                restored = (first.get(label_field) or page_key.upper()).strip().upper()
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
