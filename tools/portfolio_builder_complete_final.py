#!/usr/bin/env python3
"""Windows-safe final shell for complete portfolio routing/font controls."""

from __future__ import annotations

import sys
import tkinter as tk
from pathlib import Path
from tkinter import ttk

from portfolio_builder_complete import CompletePortfolioBuilder, FIXED_DEFAULT_ROUTES
from portfolio_builder_simple import SimplePortfolioBuilder


class FinalCompletePortfolioBuilder(CompletePortfolioBuilder):
    def _build_route_box(self, box: ttk.LabelFrame, page_key: str, *, fixed: bool) -> None:
        route = tk.StringVar(value=FIXED_DEFAULT_ROUTES.get(page_key, self._route_from_name(page_key)))
        show = tk.BooleanVar(value=fixed)
        label = tk.StringVar(value=page_key.upper())
        order = tk.StringVar(value="10")
        self.route_vars[page_key] = {"route": route, "show": show, "label": label, "order": order}

        box.columnconfigure(1, weight=1)
        ttk.Label(box, text="URL path").grid(row=0, column=0, sticky="w", padx=(0, 8), pady=3)
        route_entry = ttk.Entry(box, textvariable=route)
        route_entry.grid(row=0, column=1, sticky="ew", pady=3)
        ttk.Label(box, text="Example: /scenic_art/").grid(row=0, column=2, sticky="w", padx=(8, 0), pady=3)

        ttk.Checkbutton(box, text="Show in top menu", variable=show).grid(row=1, column=0, sticky="w", pady=3)
        ttk.Label(box, text="Menu label").grid(row=1, column=1, sticky="w", pady=3)
        menu_entry = ttk.Entry(box, textvariable=label, width=24)
        menu_entry.grid(row=2, column=1, sticky="w", pady=3)
        controls = ttk.Frame(box)
        controls.grid(row=1, column=2, rowspan=2, sticky="e")
        ttk.Button(controls, text="↑ Move Up", command=lambda p=page_key: self._move_menu(p, -1)).pack(side="left", padx=(0, 4))
        ttk.Button(controls, text="↓ Move Down", command=lambda p=page_key: self._move_menu(p, 1)).pack(side="left")
        ttk.Label(box, text="Old addresses remain valid automatically when the route changes.", foreground="#666").grid(row=3, column=0, columnspan=3, sticky="w", pady=(5, 0))
        self.route_widgets[page_key] = {"route": route_entry, "label": menu_entry}

        font_holder = ttk.Frame(box)
        font_holder.grid(row=4, column=0, columnspan=3, sticky="ew")
        self._font_control(font_holder, page_key, "nav_label")

    def _build_custom_page_tab(self, meta_index: int) -> None:
        # Bypass the intermediate enhancement so we can add the same controls
        # using grid-safe containers inside the Page identity box.
        SimplePortfolioBuilder._build_custom_page_tab(self, meta_index)
        if meta_index >= len(self.rows):
            return
        row = self.rows[meta_index]
        page_key = self._slug(row.get("product_id", ""))
        tab = self.custom_page_tabs.get(page_key)
        if tab is None:
            return

        meta_box = next((c for c in self._walk(tab) if isinstance(c, ttk.LabelFrame) and c.cget("text") == "Page identity"), None)
        if meta_box is None:
            return
        name_entry = self.custom_page_meta_widgets[meta_index]["name"]
        path_entry = self.custom_page_meta_widgets[meta_index]["path"]
        path_entry.configure(state="normal")

        stored_route = row.get("route_path") or row.get("destination_url") or self._route_from_name(row.get("title") or page_key)
        route_var = tk.StringVar(value=self._normalize_route(stored_route, row.get("title") or page_key))
        path_entry.configure(textvariable=route_var)
        auto_var = tk.BooleanVar(value=not bool(row.get("route_path")))
        self._custom_auto_route[page_key] = auto_var
        show_var = tk.BooleanVar(value=self._truthy(row.get("show_in_nav", "")))
        label_var = tk.StringVar(value=row.get("nav_label") or row.get("title") or page_key.upper())
        order_var = tk.StringVar(value=row.get("nav_order") or str(self._next_nav_order()))
        self.route_vars[page_key] = {"route": route_var, "show": show_var, "label": label_var, "order": order_var}
        self.route_widgets[page_key] = {"route": path_entry}

        for child in meta_box.winfo_children():
            if isinstance(child, ttk.Label) and child.cget("text") == "Portable URL":
                child.configure(text="URL path")

        ttk.Checkbutton(meta_box, text="Auto URL from page name", variable=auto_var).grid(row=2, column=1, sticky="w", pady=3)
        ttk.Checkbutton(meta_box, text="Show in top menu", variable=show_var).grid(row=3, column=0, sticky="w", pady=3)
        ttk.Label(meta_box, text="Menu label").grid(row=3, column=1, sticky="w", pady=3)
        menu_entry = ttk.Entry(meta_box, textvariable=label_var)
        menu_entry.grid(row=4, column=1, sticky="ew", pady=3)
        controls = ttk.Frame(meta_box)
        controls.grid(row=3, column=2, rowspan=2, sticky="e")
        ttk.Button(controls, text="↑", width=4, command=lambda p=page_key: self._move_menu(p, -1)).pack(side="left", padx=(0, 3))
        ttk.Button(controls, text="↓", width=4, command=lambda p=page_key: self._move_menu(p, 1)).pack(side="left")
        self.route_widgets[page_key]["label"] = menu_entry

        font_holder = ttk.Frame(meta_box)
        font_holder.grid(row=5, column=0, columnspan=3, sticky="ew")
        self._font_control(font_holder, page_key, "nav_label")

        def name_changed(_event=None):
            if auto_var.get():
                route_var.set(self._route_from_name(name_entry.get()))
        name_entry.bind("<KeyRelease>", name_changed, add="+")

        def route_typed(_event=None):
            auto_var.set(False)
        path_entry.bind("<KeyRelease>", route_typed, add="+")


def main() -> None:
    initial = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else None
    FinalCompletePortfolioBuilder(initial).mainloop()


if __name__ == "__main__":
    main()
