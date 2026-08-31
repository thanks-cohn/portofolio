#!/usr/bin/env python3
"""Final visual UX layer for the Quandranea portfolio builder.

Makes heading type and font size true dropdown choices rather than free-typing
fields while retaining the embedded R2 viewers and mouse-driven color pickers.
"""

from __future__ import annotations

import sys
import tkinter as tk
from pathlib import Path
from tkinter import ttk

from portfolio_builder import PortfolioBuilder, TEXT_TAGS, widget_get
from portfolio_builder_media import R2_COLUMN
from portfolio_builder_visual import (
    EmbeddedMediaViewer,
    PAGE_STYLE_DEFAULTS,
    SIZE_CHOICES,
    VisualPortfolioBuilder,
)


class FinalVisualPortfolioBuilder(VisualPortfolioBuilder):
    def _build_ui(self) -> None:
        # Build the ordinary editor first, then add one compact R2 credential
        # row and an embedded media viewport at the top of the selected block.
        PortfolioBuilder._build_ui(self)
        config = self._media_config
        remembered = config.get("r2_credentials_location") or config.get("r2_token_location") or "NULL"
        self.r2_credentials_location = tk.StringVar(value=remembered)

        publishing = next(
            (
                child
                for child in self.winfo_children()
                if isinstance(child, ttk.LabelFrame) and child.cget("text") == "Website publishing"
            ),
            None,
        )
        if publishing is not None:
            ttk.Separator(publishing).grid(row=3, column=0, columnspan=4, sticky="ew", pady=(10, 8))
            ttk.Label(publishing, text="R2 CREDENTIAL FILE:").grid(row=4, column=0, sticky="w")
            ttk.Entry(publishing, textvariable=self.r2_credentials_location).grid(
                row=4, column=1, sticky="ew", padx=8
            )
            ttk.Button(publishing, text="Browse…", command=self.choose_r2_credentials_location).grid(
                row=4, column=2
            )
            ttk.Button(publishing, text="Save R2", command=self.save_r2_settings).grid(
                row=4, column=3, padx=(8, 0)
            )
            ttk.Label(
                publishing,
                text="cloudfare.txt contains token, account_id, public_base_url, and optional default location.",
                foreground="#666",
            ).grid(row=5, column=0, columnspan=4, sticky="w", pady=(5, 0))

        block_inner = self.block_entries["order"].master
        first_child = block_inner.winfo_children()[0]

        media_holder = ttk.Frame(block_inner)
        media_holder.pack(fill="x", before=first_child, pady=(0, 8))

        location_holder = ttk.Frame(block_inner)
        # Packing this before the original first field naturally places it
        # after the media_holder that was inserted first.
        location_holder.pack(fill="x", before=first_child, pady=(0, 10))
        ttk.Label(location_holder, text="R2 location override (optional)").pack(anchor="w")
        block_r2 = ttk.Entry(location_holder)
        block_r2.pack(fill="x", pady=(3, 0))
        self.block_entries[R2_COLUMN] = block_r2

        self.block_media_viewer = EmbeddedMediaViewer(
            self,
            media_holder,
            "Image",
            location_getter=lambda: widget_get(self.block_entries[R2_COLUMN]),
            current_url_getter=lambda: widget_get(self.block_entries["image_url"]),
            select_callback=self._select_block_media,
            max_size=(700, 260),
        )
        self.block_media_viewer.frame.pack(fill="x")

        self._install_page_intro_style_controls()

    def _build_style_strip(self, parent: ttk.LabelFrame, page_key: str, prefix: str) -> None:
        tag_var = tk.StringVar(value=PAGE_STYLE_DEFAULTS[f"{prefix}_tag"])
        color_var = tk.StringVar(value="")
        size_var = tk.StringVar(value="")
        font_var = tk.StringVar(value="")
        self.page_style_vars[(page_key, f"{prefix}_tag")] = tag_var
        self.page_style_vars[(page_key, f"{prefix}_color")] = color_var
        self.page_style_vars[(page_key, f"{prefix}_size")] = size_var
        self.page_style_vars[(page_key, f"{prefix}_font_url")] = font_var

        ttk.Label(parent, text="Type").grid(row=0, column=0, sticky="w")
        ttk.Combobox(
            parent,
            textvariable=tag_var,
            values=TEXT_TAGS,
            state="readonly",
            width=7,
        ).grid(row=1, column=0, sticky="w", padx=(0, 8))

        ttk.Label(parent, text="Color").grid(row=0, column=1, sticky="w")
        swatch = tk.Button(
            parent,
            text="Choose Color…",
            width=12,
            command=lambda p=page_key, x=prefix: self._choose_page_color(p, x),
        )
        swatch.grid(row=1, column=1, sticky="w", padx=(0, 8))
        self.page_color_buttons[(page_key, prefix)] = swatch

        ttk.Label(parent, text="Size").grid(row=0, column=2, sticky="w")
        ttk.Combobox(
            parent,
            textvariable=size_var,
            values=SIZE_CHOICES,
            state="readonly",
            width=8,
        ).grid(row=1, column=2, sticky="w", padx=(0, 8))

        ttk.Label(parent, text="Google Font URL").grid(row=0, column=3, sticky="w")
        ttk.Entry(parent, textvariable=font_var).grid(row=1, column=3, sticky="ew")
        parent.columnconfigure(3, weight=1)

    def _build_section_card(self, parent: ttk.Frame, row_index: int) -> None:
        super()._build_section_card(parent, row_index)

        widgets = self.section_widgets.get(row_index, {})
        for key in ("header_tag", "subheader_tag", "body_tag"):
            widget = widgets.get(key)
            if isinstance(widget, ttk.Combobox):
                widget.configure(state="readonly")

        for widget in self.section_size_widgets.get(row_index, {}).values():
            widget.configure(state="readonly")


def main() -> None:
    initial = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else None
    FinalVisualPortfolioBuilder(initial).mainloop()


if __name__ == "__main__":
    main()
