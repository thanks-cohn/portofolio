#!/usr/bin/env python3
"""Simple topic-agnostic UX for the Quandranea portfolio builder.

The editor presents content concepts (image, text, section, location,
orientation and links) while keeping NUME's legacy commerce-shaped catalog
fields as invisible compatibility plumbing. It also supports portable custom
pages exported at /pages/<slug>/.
"""

from __future__ import annotations

import re
import sys
import tkinter as tk
from pathlib import Path
from tkinter import ttk

from portfolio_builder import PortfolioBuilder, widget_get, widget_set
from portfolio_builder_visual import PAGE_STYLE_DEFAULTS, SECTION_SIZE_COLUMNS
from portfolio_builder_visual_contained import ContainedVisualPortfolioBuilder

BLOCK_EXTRA_COLUMNS = ("content_section", "content_location", "orientation")
ORIENTATION_CHOICES = ["auto", "landscape", "portrait", "square"]
CUSTOM_PAGE_FIELDS = (
    ("title", "Page title", False, "NEW PAGE"),
    ("kicker", "Subheading", False, "Section"),
    ("body", "Body text", True, "Add your page text here."),
)


class SimplePortfolioBuilder(ContainedVisualPortfolioBuilder):
    def __init__(self, initial_path: Path | None = None) -> None:
        self.page_notebook: ttk.Notebook | None = None
        self.custom_page_tabs: dict[str, ttk.Frame] = {}
        self.custom_page_keys: set[str] = set()
        self.custom_page_meta_widgets: dict[int, dict[str, ttk.Entry]] = {}
        super().__init__(initial_path)

    # ---------- simplified UI ----------

    def _walk(self, widget: tk.Misc):
        for child in widget.winfo_children():
            yield child
            yield from self._walk(child)

    def _build_ui(self) -> None:
        super()._build_ui()
        self._simplify_block_editor()
        self._install_custom_page_toolbar()

    def _simplify_block_editor(self) -> None:
        block_inner = self.block_entries["title"].master
        labels = {
            child.cget("text"): child
            for child in block_inner.winfo_children()
            if isinstance(child, ttk.Label)
        }

        rename = {
            "Card / project title": "Title",
            "Project description": "Text / description",
            "Image alt text": "Image description (accessibility)",
            "Link label": "Button / link label",
            "Redirect URL": "Destination / page URL",
        }
        for old, new in rename.items():
            if old in labels:
                labels[old].configure(text=new)

        # Keep legacy values in CSV/catalog data, but remove commerce and other
        # unrelated technical plumbing from the normal content-editing surface.
        hidden = {
            "order": "Rotunda order",
            "image_url": "Image URL",
            "price_minor": "Price / display number (minor units)",
            "currency": "Currency",
            "availability": "Availability",
            "footer_icon_ref": "Footer icon reference",
            "footer_icon_label": "Footer icon label",
            "footer_icon_url": "Footer icon URL",
        }
        for field, label_text in hidden.items():
            widget = self.block_entries.get(field)
            label = labels.get(label_text)
            if widget is not None:
                widget.pack_forget()
            if label is not None:
                label.pack_forget()

        title_label = labels.get("Card / project title") or labels.get("Title")
        meta = ttk.LabelFrame(block_inner, text="Content placement", padding=8)
        if title_label is not None:
            meta.pack(fill="x", before=title_label, pady=(2, 10))
        else:
            meta.pack(fill="x", pady=(2, 10))

        ttk.Label(meta, text="Section / category").grid(row=0, column=0, sticky="w")
        section = ttk.Entry(meta)
        section.grid(row=1, column=0, sticky="ew", padx=(0, 8))
        self.block_entries["content_section"] = section

        ttk.Label(meta, text="Location / context").grid(row=0, column=1, sticky="w")
        location = ttk.Entry(meta)
        location.grid(row=1, column=1, sticky="ew", padx=(0, 8))
        self.block_entries["content_location"] = location

        ttk.Label(meta, text="Orientation").grid(row=0, column=2, sticky="w")
        orientation = ttk.Combobox(meta, values=ORIENTATION_CHOICES, state="readonly", width=12)
        orientation.grid(row=1, column=2, sticky="ew")
        self.block_entries["orientation"] = orientation
        meta.columnconfigure(0, weight=1)
        meta.columnconfigure(1, weight=1)

        # Rename the left-hand concept without changing any rotunda mechanics.
        for child in self._walk(self):
            if isinstance(child, ttk.Label) and child.cget("text") == "Rotunda blocks":
                child.configure(text="Content blocks")
                break

        # Make the R2 wording feel like an image-source choice, not infrastructure.
        for child in self._walk(block_inner):
            if isinstance(child, ttk.Label) and child.cget("text") == "R2 location override (optional)":
                child.configure(text="Image folder / location (optional)")

    def _find_page_notebook(self) -> ttk.Notebook | None:
        for child in self._walk(self):
            if not isinstance(child, ttk.Notebook):
                continue
            texts = {child.tab(tab_id, "text") for tab_id in child.tabs()}
            if {"ACTING", "DESIGN", "RESUME", "CONTACT"}.issubset(texts):
                return child
        return None

    def _install_custom_page_toolbar(self) -> None:
        self.page_notebook = self._find_page_notebook()
        if self.page_notebook is None:
            return
        toolbar = ttk.Frame(self.page_notebook.master)
        toolbar.pack(fill="x", before=self.page_notebook, pady=(0, 7))
        ttk.Label(
            toolbar,
            text="Pages",
            font=("TkDefaultFont", 11, "bold"),
        ).pack(side="left")
        ttk.Button(toolbar, text="ADD PAGE +", command=self.add_custom_page).pack(side="right")
        ttk.Label(
            toolbar,
            text="New pages get a portable /pages/name/ URL.",
            foreground="#666",
        ).pack(side="right", padx=(0, 12))

    # ---------- CSV support ----------

    @staticmethod
    def _slug(value: str) -> str:
        value = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
        return value or "page"

    def _custom_meta_indices(self) -> list[int]:
        return [
            index
            for index, row in enumerate(self.rows)
            if row.get("record_type") == "page_meta" and self._slug(row.get("product_id", ""))
        ]

    def _ensure_page_style_rows(self) -> None:
        # Retain the fixed page behavior from the visual builder.
        super()._ensure_page_style_rows()
        existing = dict(self.page_style_rows)
        custom_keys = {
            self._slug(row.get("product_id", ""))
            for row in self.rows
            if row.get("record_type") == "page_meta"
        }
        for page_key in sorted(custom_keys):
            for field_key, default in PAGE_STYLE_DEFAULTS.items():
                key = (page_key, field_key)
                if key in existing:
                    continue
                row = self._new_csv_row()
                row.update(record_type="page_style", product_id=page_key, title=field_key, description=default)
                self.rows.append(row)
                existing[key] = len(self.rows) - 1
        self.page_style_rows = existing

    def load_file(self, path: Path) -> None:
        self._clear_custom_page_tabs()
        super().load_file(path)
        if not self.fieldnames:
            return

        for column in BLOCK_EXTRA_COLUMNS:
            if column not in self.fieldnames:
                self.fieldnames.append(column)
        for row in self.rows:
            for column in BLOCK_EXTRA_COLUMNS:
                row.setdefault(column, "")
            if (row.get("record_type") or "block") == "block" and not row.get("orientation"):
                row["orientation"] = "auto"

        self._ensure_page_style_rows()
        self._rebuild_custom_page_tabs()
        self._load_page_styles()
        self._rebuild_section_editors()
        if self.current_block_position is not None:
            self._load_block(self.current_block_position)

    # ---------- custom pages ----------

    def _clear_custom_page_tabs(self) -> None:
        if self.page_notebook is not None:
            for tab in list(self.custom_page_tabs.values()):
                try:
                    self.page_notebook.forget(tab)
                except tk.TclError:
                    pass
        for key in self.custom_page_keys:
            self.section_hosts.pop(key, None)
            for entry_key in [item for item in self.page_entries if item[0] == key]:
                self.page_entries.pop(entry_key, None)
            for style_key in [item for item in self.page_style_vars if item[0] == key]:
                self.page_style_vars.pop(style_key, None)
        self.custom_page_tabs = {}
        self.custom_page_keys = set()
        self.custom_page_meta_widgets = {}

    def _rebuild_custom_page_tabs(self) -> None:
        if self.page_notebook is None:
            return
        self._clear_custom_page_tabs()
        for row_index in self._custom_meta_indices():
            self._build_custom_page_tab(row_index)

    def _build_custom_page_tab(self, meta_index: int) -> None:
        if self.page_notebook is None or meta_index >= len(self.rows):
            return
        meta = self.rows[meta_index]
        page_key = self._slug(meta.get("product_id", ""))
        if not page_key:
            return
        page_name = meta.get("title") or page_key.replace("-", " ").title()
        path_value = meta.get("destination_url") or f"/pages/{page_key}/"

        tab = ttk.Frame(self.page_notebook, padding=8)
        self.page_notebook.add(tab, text=page_name[:22])
        self.custom_page_tabs[page_key] = tab
        self.custom_page_keys.add(page_key)

        canvas, inner = self._scrolling_frame(tab)
        canvas.pack(fill="both", expand=True)

        head = ttk.Frame(inner)
        head.pack(fill="x", pady=(2, 8))
        ttk.Label(head, text="Custom page", font=("TkDefaultFont", 11, "bold")).pack(side="left")
        ttk.Button(head, text="ADD + SECTION", command=lambda p=page_key: self.add_page_section(p)).pack(side="right")

        meta_box = ttk.LabelFrame(inner, text="Page identity", padding=8)
        meta_box.pack(fill="x", pady=(0, 10))
        meta_box.columnconfigure(1, weight=1)
        ttk.Label(meta_box, text="Page name").grid(row=0, column=0, sticky="w", padx=(0, 8), pady=3)
        name_entry = ttk.Entry(meta_box)
        name_entry.grid(row=0, column=1, sticky="ew", pady=3)
        widget_set(name_entry, page_name)

        ttk.Label(meta_box, text="Portable URL").grid(row=1, column=0, sticky="w", padx=(0, 8), pady=3)
        path_entry = ttk.Entry(meta_box)
        path_entry.grid(row=1, column=1, sticky="ew", pady=3)
        widget_set(path_entry, path_value)
        path_entry.configure(state="readonly")
        ttk.Button(meta_box, text="Copy", command=lambda p=path_value: self._copy_page_path(p)).grid(row=1, column=2, padx=(8, 0))
        self.custom_page_meta_widgets[meta_index] = {"name": name_entry, "path": path_entry}

        for field_key, label, multiline, default in CUSTOM_PAGE_FIELDS:
            ttk.Label(inner, text=label).pack(anchor="w", pady=(10, 4))
            if multiline:
                widget: tk.Text | ttk.Entry = tk.Text(inner, height=5, wrap="word", undo=True)
            else:
                widget = ttk.Entry(inner)
            widget.pack(fill="x")
            self.page_entries[(page_key, field_key)] = widget
            row_index = self.page_row_indices.get((page_key, field_key))
            value = self.rows[row_index].get("description", default) if row_index is not None else default
            widget_set(widget, value or default)

            strip = ttk.LabelFrame(inner, text=f"{label} style", padding=7)
            strip.pack(fill="x", pady=(4, 8))
            self._build_style_strip(strip, page_key, field_key)

        ttk.Separator(inner).pack(fill="x", pady=18)
        ttk.Label(inner, text="Image / text sections", font=("TkDefaultFont", 10, "bold")).pack(anchor="w")
        host = ttk.Frame(inner)
        host.pack(fill="x", pady=(8, 0))
        self.section_hosts[page_key] = host

    def _copy_page_path(self, path_value: str) -> None:
        self.clipboard_clear()
        self.clipboard_append(path_value)
        self.status_text.set(f"Copied page URL path: {path_value}")

    def add_custom_page(self) -> None:
        if not self.fieldnames:
            return
        self._commit_all()
        existing = {self._slug(self.rows[i].get("product_id", "")) for i in self._custom_meta_indices()}
        number = 1
        while f"new-page-{number}" in existing:
            number += 1
        page_key = f"new-page-{number}"
        page_name = f"New Page {number}"
        page_path = f"/pages/{page_key}/"

        meta = self._new_csv_row()
        meta.update(
            record_type="page_meta",
            product_id=page_key,
            title=page_name,
            destination_url=page_path,
        )
        self.rows.append(meta)

        defaults = {
            "title": page_name.upper(),
            "kicker": "Section",
            "body": "Add your page text here.",
        }
        for field_key, value in defaults.items():
            row = self._new_csv_row()
            row.update(record_type="page_text", product_id=page_key, title=field_key, description=value)
            self.rows.append(row)

        for field_key, value in PAGE_STYLE_DEFAULTS.items():
            row = self._new_csv_row()
            row.update(record_type="page_style", product_id=page_key, title=field_key, description=value)
            self.rows.append(row)

        first_image = ""
        first_alt = "Page section image"
        if self.block_indices:
            first = self.rows[self.block_indices[0]]
            first_image = first.get("image_url", "")
            first_alt = first.get("image_alt", "") or first_alt
        section = self._new_csv_row()
        section.update(
            record_type="page_section",
            product_id=page_key,
            order="1",
            availability="left",
            title="New section",
            destination_label="Subheader",
            description="Add body text here.",
            image_url=first_image,
            image_alt=first_alt,
            font_scope="h2",
            font_product_id="h3",
            color_scope="p",
            text_color="#f1eee7",
            color_product_id="#b4b2ad",
            footer_icon_ref="#b4b2ad",
        )
        for column in SECTION_SIZE_COLUMNS.values():
            section[column] = ""
        self.rows.append(section)

        self._ensure_page_rows()
        self._ensure_page_style_rows()
        self._rebuild_custom_page_tabs()
        self._load_page_styles()
        self._rebuild_section_editors()
        tab = self.custom_page_tabs.get(page_key)
        if tab is not None and self.page_notebook is not None:
            self.page_notebook.select(tab)
        self.status_text.set(f"Added {page_name}: {page_path}")

    # ---------- commits / defaults ----------

    def _commit_custom_page_meta(self) -> None:
        for row_index, widgets in self.custom_page_meta_widgets.items():
            if row_index >= len(self.rows):
                continue
            self.rows[row_index]["title"] = widgets["name"].get().strip() or "Untitled Page"

    def _commit_all(self) -> None:
        super()._commit_all()
        self._commit_custom_page_meta()

    def add_block(self) -> None:
        super().add_block()
        if self.current_block_position is None:
            return
        row_index = self.block_indices[self.current_block_position]
        row = self.rows[row_index]
        row.setdefault("content_section", "")
        row.setdefault("content_location", "")
        row["orientation"] = row.get("orientation") or "auto"
        if row.get("destination_label") in {"Visit project", ""}:
            row["destination_label"] = "View"
        self._load_block(self.current_block_position)


def main() -> None:
    initial = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else None
    SimplePortfolioBuilder(initial).mainloop()


if __name__ == "__main__":
    main()
