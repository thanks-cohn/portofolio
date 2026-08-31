#!/usr/bin/env python3
"""Complete intuitive editing layer for the Quandranea portfolio builder.

Adds editable page routing with aliases, top-menu controls and per-visible-text
Google Font inputs while preserving the existing CSV/content architecture.
"""

from __future__ import annotations

import re
import sys
import tkinter as tk
from pathlib import Path
from tkinter import ttk

from portfolio_builder import GLOBAL_FIELDS, PAGE_FIELDS, widget_get, widget_set
from portfolio_builder_simple import SimplePortfolioBuilder

FIXED_PAGES = ("acting", "design", "resume", "contact")
FIXED_DEFAULT_ROUTES = {key: f"/{key}/" for key in FIXED_PAGES}
FIXED_NAV_FIELDS = {
    "acting": ("nav_acting_label", "nav_acting_url"),
    "design": ("nav_design_label", "nav_design_url"),
    "resume": ("nav_resume_label", "nav_resume_url"),
    "contact": ("nav_contact_label", "nav_contact_url"),
}
ROUTE_COLUMNS = ("route_path", "route_aliases", "show_in_nav", "nav_label", "nav_order")
GLOBAL_FONT_FIELDS = {
    "row_heading", "row_subheader", "brand_top", "brand_bottom",
    "nav_home_label", "nav_acting_label", "nav_design_label", "nav_resume_label", "nav_contact_label",
    "footer_left", "details_label", "visit_label", "preview_header", "preview_source_prefix", "preview_note",
}
BLOCK_FONT_FIELDS = ("title", "description", "content_section", "content_location", "destination_label")


class CompletePortfolioBuilder(SimplePortfolioBuilder):
    def __init__(self, initial_path: Path | None = None) -> None:
        self.route_vars: dict[str, dict[str, tk.Variable]] = {}
        self.route_widgets: dict[str, dict[str, tk.Widget]] = {}
        self.font_vars: dict[tuple[str, str], tk.StringVar] = {}
        self.font_rows: dict[tuple[str, str], int] = {}
        self.block_font_vars: dict[str, tk.StringVar] = {}
        self._custom_auto_route: dict[str, tk.BooleanVar] = {}
        super().__init__(initial_path)

    # ---------- helpers ----------

    @staticmethod
    def _route_slug(value: str) -> str:
        value = re.sub(r"[^a-z0-9]+", "_", (value or "").strip().lower()).strip("_")
        return value or "page"

    @classmethod
    def _route_from_name(cls, name: str) -> str:
        return f"/{cls._route_slug(name)}/"

    @classmethod
    def _normalize_route(cls, value: str, fallback_name: str = "page") -> str:
        text = (value or "").strip()
        if re.match(r"^https?://", text, re.I):
            try:
                from urllib.parse import urlparse
                text = urlparse(text).path
            except Exception:
                text = ""
        segments = [cls._route_slug(part) for part in text.strip("/").split("/") if part.strip()]
        if not segments:
            segments = [cls._route_slug(fallback_name)]
        return "/" + "/".join(segments) + "/"

    @staticmethod
    def _truthy(value: str) -> bool:
        return (value or "").strip().lower() in {"1", "true", "yes", "on", "show"}

    def _font_row_map(self) -> dict[tuple[str, str], int]:
        return {
            ((row.get("product_id") or "").strip(), (row.get("title") or "").strip()): index
            for index, row in enumerate(self.rows)
            if row.get("record_type") == "font_input" and row.get("product_id") and row.get("title")
        }

    def _font_value(self, context: str, field: str) -> str:
        index = self.font_rows.get((context, field))
        return self.rows[index].get("description", "") if index is not None and index < len(self.rows) else ""

    def _bind_wholesale_paste(self, entry: ttk.Entry, var: tk.StringVar) -> None:
        def paste(_event=None):
            try:
                var.set(self.clipboard_get())
                entry.icursor("end")
                return "break"
            except tk.TclError:
                return None
        entry.bind("<Control-v>", paste)
        entry.bind("<Control-V>", paste)
        entry.bind("<<Paste>>", paste)

    def _font_control(self, parent: tk.Misc, context: str, field: str, *, pack_after: tk.Widget | None = None) -> tk.StringVar:
        var = tk.StringVar(value=self._font_value(context, field))
        self.font_vars[(context, field)] = var
        frame = ttk.Frame(parent)
        kwargs = {"fill": "x", "pady": (2, 7)}
        if pack_after is not None:
            kwargs["after"] = pack_after
        frame.pack(**kwargs)
        ttk.Label(frame, text="Google Font").pack(side="left")
        entry = ttk.Entry(frame, textvariable=var)
        entry.pack(side="left", fill="x", expand=True, padx=(8, 5))
        ttk.Button(frame, text="Paste", width=7, command=lambda v=var: self._paste_font(v)).pack(side="right")
        self._bind_wholesale_paste(entry, var)
        return var

    def _paste_font(self, var: tk.StringVar) -> None:
        try:
            var.set(self.clipboard_get())
            self.status_text.set("Google Font markup pasted")
        except tk.TclError:
            self.status_text.set("Clipboard is empty")

    # ---------- UI ----------

    def _build_ui(self) -> None:
        super()._build_ui()
        self._install_fixed_route_controls()
        self._install_global_font_controls()
        self._install_block_font_controls()
        self._install_other_page_font_controls()
        self._upgrade_existing_font_inputs()

    def _install_fixed_route_controls(self) -> None:
        for page_key in FIXED_PAGES:
            definitions = PAGE_FIELDS[page_key]
            first_field = definitions[0][0]
            first_widget = self.page_entries.get((page_key, first_field))
            if first_widget is None:
                continue
            inner = first_widget.master
            box = ttk.LabelFrame(inner, text="Page address & top menu", padding=8)
            children = inner.winfo_children()
            title_row = children[0] if children else None
            if title_row is not None:
                box.pack(fill="x", after=title_row, pady=(0, 10))
            else:
                box.pack(fill="x", pady=(0, 10))
            self._build_route_box(box, page_key, fixed=True)

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

        # Menu labels are visible text too.
        self._font_control(box, page_key, "nav_label")

    def _install_global_font_controls(self) -> None:
        for field, _label in GLOBAL_FIELDS:
            if field not in GLOBAL_FONT_FIELDS:
                continue
            widget = self.global_entries.get(field)
            if widget is None:
                continue
            self._font_control(widget.master, "site", field, pack_after=widget)

    def _install_block_font_controls(self) -> None:
        for field in BLOCK_FONT_FIELDS:
            widget = self.block_entries.get(field)
            if widget is None:
                continue
            var = tk.StringVar(value="")
            self.block_font_vars[field] = var
            frame = ttk.Frame(widget.master)
            frame.pack(fill="x", after=widget, pady=(2, 7))
            ttk.Label(frame, text="Google Font").pack(side="left")
            entry = ttk.Entry(frame, textvariable=var)
            entry.pack(side="left", fill="x", expand=True, padx=(8, 5))
            ttk.Button(frame, text="Paste", width=7, command=lambda v=var: self._paste_font(v)).pack(side="right")
            self._bind_wholesale_paste(entry, var)

    def _install_other_page_font_controls(self) -> None:
        # ACTING/DESIGN/CONTACT title, kicker and body already have richer style strips.
        # Add font controls to everything else, especially every RESUME text field.
        for page_key, definitions in PAGE_FIELDS.items():
            for field_key, _label, _multiline, _default in definitions:
                if page_key in {"acting", "design", "contact"} and field_key in {"title", "kicker", "body"}:
                    continue
                widget = self.page_entries.get((page_key, field_key))
                if widget is None:
                    continue
                self._font_control(widget.master, page_key, field_key, pack_after=widget)

    def _upgrade_existing_font_inputs(self) -> None:
        # Existing page/section style controls already store font URLs. Make the
        # label explicit and make Ctrl+V safely accept a whole multi-line <link> block.
        for child in self._walk(self):
            if isinstance(child, ttk.Label) and child.cget("text") == "Google Font URL":
                child.configure(text="Google Font (URL or copied <link> block)")

        for (page_key, style_key), var in list(self.page_style_vars.items()):
            if not style_key.endswith("_font_url"):
                continue
            for child in self._walk(self):
                if isinstance(child, ttk.Entry) and str(child.cget("textvariable")) == str(var):
                    self._bind_wholesale_paste(child, var)

        for widgets in self.section_widgets.values():
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

    # ---------- custom page UI ----------

    def _build_custom_page_tab(self, meta_index: int) -> None:
        super()._build_custom_page_tab(meta_index)
        if meta_index >= len(self.rows):
            return
        row = self.rows[meta_index]
        page_key = self._slug(row.get("product_id", ""))
        tab = self.custom_page_tabs.get(page_key)
        if tab is None:
            return

        # The simple editor already creates the Page identity box. Upgrade it.
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

        # Replace the old readonly URL wording.
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
        self._font_control(meta_box, page_key, "nav_label")

        def name_changed(_event=None):
            if auto_var.get():
                route_var.set(self._route_from_name(name_entry.get()))
        name_entry.bind("<KeyRelease>", name_changed, add="+")

        def route_typed(_event=None):
            auto_var.set(False)
        path_entry.bind("<KeyRelease>", route_typed, add="+")

    # ---------- route data ----------

    def _route_row_index(self, page_key: str) -> int | None:
        for index, row in enumerate(self.rows):
            if row.get("record_type") not in {"page_route", "page_meta"}:
                continue
            if self._slug(row.get("product_id", "")) == page_key:
                if page_key in FIXED_PAGES and row.get("record_type") != "page_route":
                    continue
                return index
        return None

    def _ensure_fixed_route_rows(self) -> None:
        first = self.rows[self.block_indices[0]] if self.block_indices else {}
        for position, page_key in enumerate(FIXED_PAGES, start=1):
            if self._route_row_index(page_key) is not None:
                continue
            label_field, url_field = FIXED_NAV_FIELDS[page_key]
            route = self._normalize_route(first.get(url_field) or FIXED_DEFAULT_ROUTES[page_key], page_key)
            row = self._new_csv_row()
            row.update({
                "record_type": "page_route",
                "product_id": page_key,
                "route_path": route,
                "route_aliases": FIXED_DEFAULT_ROUTES[page_key],
                "show_in_nav": "true" if first.get(label_field) else "false",
                "nav_label": first.get(label_field) or page_key.upper(),
                "nav_order": str(position * 10),
            })
            self.rows.append(row)

    def _load_route_widgets(self) -> None:
        for page_key, vars_ in self.route_vars.items():
            index = self._route_row_index(page_key)
            if index is None:
                continue
            row = self.rows[index]
            name = row.get("title") or page_key
            route = row.get("route_path") or row.get("destination_url") or FIXED_DEFAULT_ROUTES.get(page_key) or self._route_from_name(name)
            vars_["route"].set(self._normalize_route(route, name))
            vars_["show"].set(self._truthy(row.get("show_in_nav", "")))
            vars_["label"].set(row.get("nav_label") or row.get("title") or page_key.upper())
            vars_["order"].set(row.get("nav_order") or "999")

    def _next_nav_order(self) -> int:
        values = []
        for row in self.rows:
            if row.get("record_type") not in {"page_route", "page_meta"}:
                continue
            try:
                values.append(int(row.get("nav_order") or 0))
            except ValueError:
                pass
        return max(values, default=0) + 10

    def _move_menu(self, page_key: str, delta: int) -> None:
        self._commit_routing()
        records = []
        for key in [*FIXED_PAGES, *sorted(self.custom_page_keys)]:
            index = self._route_row_index(key)
            if index is None:
                continue
            try:
                order = int(self.rows[index].get("nav_order") or 999)
            except ValueError:
                order = 999
            records.append((order, key, index))
        records.sort()
        position = next((i for i, (_, key, _) in enumerate(records) if key == page_key), None)
        if position is None:
            return
        target = position + delta
        if target < 0 or target >= len(records):
            return
        _, _, a = records[position]
        _, _, b = records[target]
        self.rows[a]["nav_order"], self.rows[b]["nav_order"] = self.rows[b].get("nav_order", "999"), self.rows[a].get("nav_order", "999")
        self._load_route_widgets()
        self.status_text.set(f"Moved {page_key.replace('-', ' ').title()} in top-menu order")

    @staticmethod
    def _alias_list(value: str) -> list[str]:
        return [item.strip() for item in (value or "").split(";") if item.strip()]

    def _commit_routing(self) -> None:
        for page_key, vars_ in self.route_vars.items():
            index = self._route_row_index(page_key)
            if index is None:
                continue
            row = self.rows[index]
            name = row.get("title") or page_key
            old_route = self._normalize_route(row.get("route_path") or row.get("destination_url") or FIXED_DEFAULT_ROUTES.get(page_key) or self._route_from_name(name), name)
            new_route = self._normalize_route(str(vars_["route"].get()), name)
            aliases = self._alias_list(row.get("route_aliases", ""))
            legacy = FIXED_DEFAULT_ROUTES.get(page_key)
            for candidate in (legacy, old_route if old_route != new_route else None):
                if candidate and candidate != new_route and candidate not in aliases:
                    aliases.append(candidate)
            row["route_path"] = new_route
            row["route_aliases"] = ";".join(aliases)
            row["show_in_nav"] = "true" if bool(vars_["show"].get()) else "false"
            row["nav_label"] = str(vars_["label"].get()).strip() or name
            row["nav_order"] = str(vars_["order"].get() or "999")
            if row.get("record_type") == "page_meta":
                row["destination_url"] = new_route
            vars_["route"].set(new_route)

    # ---------- font data ----------

    def _load_font_vars(self) -> None:
        self.font_rows = self._font_row_map()
        for (context, field), var in self.font_vars.items():
            var.set(self._font_value(context, field))
        self._load_block_fonts()

    def _load_block_fonts(self) -> None:
        if self.current_block_position is None or self.current_block_position >= len(self.block_indices):
            return
        row = self.rows[self.block_indices[self.current_block_position]]
        context = row.get("product_id", "")
        self.font_rows = self._font_row_map()
        for field, var in self.block_font_vars.items():
            var.set(self._font_value(context, field))

    def _save_font_value(self, context: str, field: str, value: str) -> None:
        key = (context, field)
        index = self.font_rows.get(key)
        if index is None:
            row = self._new_csv_row()
            row.update(record_type="font_input", product_id=context, title=field, description=value.strip())
            self.rows.append(row)
            self.font_rows[key] = len(self.rows) - 1
        else:
            self.rows[index]["description"] = value.strip()

    def _commit_nonblock_fonts(self) -> None:
        self.font_rows = self._font_row_map()
        for (context, field), var in self.font_vars.items():
            self._save_font_value(context, field, var.get())

    def _commit_block(self) -> None:
        # Save the font choices for the block being left before base selection logic changes position.
        if self.current_block_position is not None and self.current_block_position < len(self.block_indices):
            context = self.rows[self.block_indices[self.current_block_position]].get("product_id", "")
            self.font_rows = self._font_row_map()
            for field, var in self.block_font_vars.items():
                self._save_font_value(context, field, var.get())
        super()._commit_block()

    def _load_block(self, position: int) -> None:
        super()._load_block(position)
        self._load_block_fonts()

    # ---------- lifecycle ----------

    def load_file(self, path: Path) -> None:
        super().load_file(path)
        if not self.fieldnames:
            return
        for column in ROUTE_COLUMNS:
            if column not in self.fieldnames:
                self.fieldnames.append(column)
        for row in self.rows:
            for column in ROUTE_COLUMNS:
                row.setdefault(column, "")
        self._ensure_fixed_route_rows()
        self.font_rows = self._font_row_map()
        self._load_route_widgets()
        self._load_font_vars()

    def add_custom_page(self) -> None:
        before = {id(row) for row in self.rows if row.get("record_type") == "page_meta"}
        super().add_custom_page()
        new_indexes = [i for i, row in enumerate(self.rows) if row.get("record_type") == "page_meta" and id(row) not in before]
        if not new_indexes:
            return
        index = new_indexes[-1]
        row = self.rows[index]
        page_key = self._slug(row.get("product_id", ""))
        page_name = row.get("title") or page_key.replace("-", " ").title()
        route = self._route_from_name(page_name)
        row["route_path"] = route
        row["destination_url"] = route
        row["route_aliases"] = ""
        row["show_in_nav"] = "false"
        row["nav_label"] = page_name.upper()
        row["nav_order"] = str(self._next_nav_order())
        self._rebuild_custom_page_tabs()
        self._load_page_styles()
        self._rebuild_section_editors()
        self._load_route_widgets()
        self._load_font_vars()
        tab = self.custom_page_tabs.get(page_key)
        if tab is not None and self.page_notebook is not None:
            self.page_notebook.select(tab)
        self.status_text.set(f"Added {page_name}: {route}")

    def _commit_all(self) -> None:
        super()._commit_all()
        self._commit_routing()
        self._commit_nonblock_fonts()


def main() -> None:
    initial = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else None
    CompletePortfolioBuilder(initial).mainloop()


if __name__ == "__main__":
    main()
