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

from portfolio_builder import TEXT_TAGS
from portfolio_builder_visual import PAGE_STYLE_DEFAULTS, SIZE_CHOICES, VisualPortfolioBuilder


class FinalVisualPortfolioBuilder(VisualPortfolioBuilder):
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
