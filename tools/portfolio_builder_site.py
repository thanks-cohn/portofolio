#!/usr/bin/env python3
"""Final site-facing CMS layer for Quandranea.

Keeps the release builder stable while adding editable social links, seeded
project detail sections, and literal hyphen-preserving public routes.
"""

from __future__ import annotations

import re
import sys
import tkinter as tk
from pathlib import Path
from tkinter import ttk

from portfolio_builder import widget_get
from portfolio_builder_release import ReleasePortfolioBuilder

SOCIALS = (
    ("facebook", "Facebook"),
    ("instagram", "Instagram"),
    ("twitter", "Twitter / X"),
)


class SitePortfolioBuilder(ReleasePortfolioBuilder):
    def __init__(self, initial_path: Path | None = None) -> None:
        self.social_vars: dict[str, tk.StringVar] = {}
        super().__init__(initial_path)

    @staticmethod
    def _route_slug(value: str) -> str:
        # Human-entered spaces become underscores, but intentional hyphens are kept.
        value = re.sub(r"[^a-z0-9-]+", "_", (value or "").strip().lower()).strip("_-")
        return value or "page"

    def _build_ui(self) -> None:
        super()._build_ui()
        self._install_social_editor()

    def _install_social_editor(self) -> None:
        anchor = self.global_entries.get("footer_left")
        if anchor is None:
            return
        parent = anchor.master
        box = ttk.LabelFrame(parent, text="Social media", padding=10)
        box.pack(fill="x", pady=(18, 10))
        box.columnconfigure(1, weight=1)
        ttk.Label(
            box,
            text="These links appear as icons in the top-right header and bottom-right footer.",
            foreground="#666",
        ).grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 8))
        for row_number, (platform, label) in enumerate(SOCIALS, start=1):
            ttk.Label(box, text=f"{label} URL").grid(row=row_number, column=0, sticky="w", padx=(0, 10), pady=4)
            var = tk.StringVar(value="")
            self.social_vars[platform] = var
            ttk.Entry(box, textvariable=var).grid(row=row_number, column=1, sticky="ew", pady=4)

    def _social_row(self, platform: str) -> int | None:
        for index, row in enumerate(self.rows):
            if row.get("record_type") == "social_link" and (row.get("product_id") or "").strip().lower() == platform:
                return index
        return None

    def _ensure_social_rows(self) -> None:
        seed_by_platform = {
            str(item.get("platform") or "").strip().lower(): item
            for item in self._seed_data().get("socials", [])
        }
        for platform, label in SOCIALS:
            index = self._social_row(platform)
            if index is None:
                seed = seed_by_platform.get(platform, {})
                row = self._new_csv_row()
                row.update(
                    record_type="social_link",
                    product_id=platform,
                    title=str(seed.get("label") or label),
                    destination_url=str(seed.get("url") or ""),
                )
                self.rows.append(row)
                index = len(self.rows) - 1
            self.social_vars[platform].set(self.rows[index].get("destination_url", "") or "")

    def _append_seed_section(self, page_key: str, item: dict) -> None:
        row = self._new_csv_row()
        row.update(
            record_type="page_section",
            product_id=page_key,
            order=str(item.get("order") or ""),
            availability=str(item.get("image_side") or "left"),
            image_url=str(item.get("image_url") or ""),
            image_alt=str(item.get("image_alt") or "Project image"),
            title=str(item.get("header") or ""),
            destination_label=str(item.get("subheader") or ""),
            description=str(item.get("body") or ""),
            font_scope=str(item.get("header_tag") or "h1"),
            font_product_id=str(item.get("subheader_tag") or "h3"),
            color_scope=str(item.get("body_tag") or "p"),
            text_color=str(item.get("header_color") or "#f1eee7"),
            color_product_id=str(item.get("subheader_color") or "#b4b2ad"),
            footer_icon_ref=str(item.get("body_color") or "#b4b2ad"),
            destination_url=str(item.get("header_font_url") or "https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,500&display=swap"),
            footer_icon_label=str(item.get("subheader_font_url") or "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500&display=swap"),
            footer_icon_url=str(item.get("body_font_url") or "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400&display=swap"),
            header_size=str(item.get("header_size") or "52"),
            subheader_size=str(item.get("subheader_size") or "17"),
            body_size=str(item.get("body_size") or "16"),
            section_link_url=str(item.get("image_link_url") or ""),
        )
        self.rows.append(row)

    def _ensure_hidden_project_sections(self) -> None:
        for page in self._seed_data().get("hidden_pages", []):
            page_key = self._slug(str(page.get("key") or ""))
            if not page_key:
                continue
            existing = any(
                row.get("record_type") == "page_section"
                and self._slug(row.get("product_id", "")) == page_key
                for row in self.rows
            )
            if existing:
                continue
            for item in page.get("sections", []):
                self._append_seed_section(page_key, item)

    def load_file(self, path: Path) -> None:
        super().load_file(path)
        if not self.fieldnames:
            return
        self._ensure_social_rows()
        self._ensure_hidden_project_sections()
        self._ensure_page_rows()
        self._ensure_page_style_rows()
        self._rebuild_custom_page_tabs()
        self._load_page_styles()
        self._rebuild_section_editors()
        self._load_route_widgets()
        self._load_font_vars()

    def _commit_socials(self) -> None:
        for platform, label in SOCIALS:
            index = self._social_row(platform)
            if index is None:
                row = self._new_csv_row()
                row.update(record_type="social_link", product_id=platform, title=label)
                self.rows.append(row)
                index = len(self.rows) - 1
            self.rows[index]["title"] = label
            self.rows[index]["destination_url"] = self.social_vars[platform].get().strip()

    def _commit_all(self) -> None:
        super()._commit_all()
        self._commit_socials()


def main() -> None:
    initial = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else None
    SitePortfolioBuilder(initial).mainloop()


if __name__ == "__main__":
    main()
