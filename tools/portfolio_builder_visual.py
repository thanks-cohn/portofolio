#!/usr/bin/env python3
"""Embedded visual editing layer for the Quandranea portfolio builder.

Keeps R2 image browsing inside each block/page-section card and adds visual
page-intro typography controls. The CSV remains the sole source of truth.
"""

from __future__ import annotations

import base64
import threading
import tkinter as tk
from io import BytesIO
from pathlib import Path
from tkinter import colorchooser, ttk

from portfolio_builder import PAGE_FIELDS, PortfolioBuilder, TEXT_TAGS, widget_get, widget_set
from portfolio_builder_credentials import CredentialMediaPortfolioBuilder
from portfolio_builder_media import Image, ImageTk, R2Failure, R2_COLUMN

PAGE_STYLE_DEFAULTS = {
    "title_tag": "h1",
    "title_color": "",
    "title_size": "",
    "title_font_url": "",
    "kicker_tag": "p",
    "kicker_color": "",
    "kicker_size": "",
    "kicker_font_url": "",
    "body_tag": "p",
    "body_color": "",
    "body_size": "",
    "body_font_url": "",
}
SECTION_SIZE_COLUMNS = {
    "header_size": "header_size",
    "subheader_size": "subheader_size",
    "body_size": "body_size",
}
SIZE_CHOICES = [str(value) for value in (12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 42, 48, 56, 64, 72, 84, 96)]


class EmbeddedMediaViewer:
    """Small R2 image browser embedded directly inside an editor card."""

    def __init__(
        self,
        owner: "VisualPortfolioBuilder",
        parent: tk.Misc,
        label: str,
        location_getter,
        current_url_getter,
        select_callback,
        max_size: tuple[int, int],
    ) -> None:
        self.owner = owner
        self.location_getter = location_getter
        self.current_url_getter = current_url_getter
        self.select_callback = select_callback
        self.max_size = max_size
        self.objects: list[dict] = []
        self.bucket = ""
        self.prefix = ""
        self.public_base = ""
        self.index = 0
        self.photo = None
        self.request_id = 0
        self.selected = tk.BooleanVar(value=False)

        self.frame = ttk.LabelFrame(parent, text=label, padding=8)
        self.stage = tk.Label(
            self.frame,
            text="R2 image viewer",
            bg="#111111",
            fg="#d8d4cd",
            height=10,
            compound="center",
            justify="center",
        )
        self.stage.pack(fill="x", expand=True)

        self.filename = ttk.Label(self.frame, text="", anchor="center")
        self.filename.pack(fill="x", pady=(5, 2))

        controls = ttk.Frame(self.frame)
        controls.pack(fill="x", pady=(3, 0))
        self.select_check = ttk.Checkbutton(
            controls,
            text="✓ Select",
            variable=self.selected,
            command=self._selection_changed,
        )
        self.select_check.pack(side="left")
        ttk.Button(controls, text="↻", width=3, command=self.refresh).pack(side="left", padx=(6, 0))
        self.prev_button = ttk.Button(controls, text="←", width=4, command=lambda: self.move(-1))
        self.prev_button.pack(side="right")
        self.counter = ttk.Label(controls, text="0 / 0", width=10, anchor="center")
        self.counter.pack(side="right", padx=5)
        self.next_button = ttk.Button(controls, text="→", width=4, command=lambda: self.move(1))
        self.next_button.pack(side="right")

        self.status = ttk.Label(self.frame, text="", foreground="#666", anchor="w")
        self.status.pack(fill="x", pady=(4, 0))
        self._set_nav(False)

    def refresh(self) -> None:
        self.selected.set(False)
        self._set_nav(False)
        self.objects = []
        self.photo = None
        self.stage.configure(image="", text="Loading R2 images…")
        self.filename.configure(text="")
        self.counter.configure(text="0 / 0")
        self.status.configure(text="")
        try:
            location = self.owner._effective_r2_location(self.location_getter())
            self.bucket, self.prefix = self.owner._parse_r2_location(location)
            self.owner._read_r2_credentials()
        except R2Failure as exc:
            self.stage.configure(text="R2 viewer ready")
            self.status.configure(text=str(exc))
            return

        def worker() -> None:
            try:
                objects = self.owner._r2_list_images(self.bucket, self.prefix)
                public_base = self.owner._r2_public_base_for_bucket(self.bucket)
                self.owner.after(0, lambda: self._listing_ready(objects, public_base))
            except R2Failure as exc:
                self.owner.after(0, lambda: self._listing_failed(str(exc)))

        threading.Thread(target=worker, daemon=True).start()

    def _listing_ready(self, objects: list[dict], public_base: str) -> None:
        self.objects = objects
        self.public_base = public_base
        if not objects:
            self.stage.configure(image="", text="No images in this R2 location")
            self.status.configure(text="Change the location override or the default location in cloudfare.txt.")
            return
        current = self.current_url_getter().strip()
        self.index = 0
        if current and public_base:
            for position, item in enumerate(objects):
                key = str(item.get("key") or "")
                if self._public_url(key) == current:
                    self.index = position
                    break
        self._set_nav(True)
        self.show_current()

    def _listing_failed(self, error: str) -> None:
        self.stage.configure(image="", text="Could not load R2 images")
        self.status.configure(text=error)
        self._set_nav(False)

    def _public_url(self, key: str) -> str:
        return self.owner._public_url_from_base(self.public_base, key)

    def show_current(self) -> None:
        if not self.objects:
            return
        item = self.objects[self.index]
        key = str(item.get("key") or "")
        self.counter.configure(text=f"{self.index + 1} / {len(self.objects)}")
        self.filename.configure(text=key)
        self.stage.configure(image="", text="Loading image…")
        self.status.configure(text="Check ✓ Select to freeze this image.")
        self.request_id += 1
        request_id = self.request_id

        def worker() -> None:
            try:
                data = self.owner._r2_get_object_bytes(self.bucket, key)
                self.owner.after(0, lambda: self._render_bytes(key, data, request_id))
            except R2Failure as exc:
                self.owner.after(0, lambda: self._preview_failed(str(exc), request_id))

        threading.Thread(target=worker, daemon=True).start()

    def _render_bytes(self, key: str, data: bytes, request_id: int) -> None:
        if request_id != self.request_id:
            return
        self.photo = None
        if Image is not None and ImageTk is not None:
            try:
                image = Image.open(BytesIO(data))
                resampling = getattr(getattr(Image, "Resampling", Image), "LANCZOS", 1)
                image.thumbnail(self.max_size, resampling)
                self.photo = ImageTk.PhotoImage(image)
                self.stage.configure(image=self.photo, text="")
                return
            except Exception:
                pass
        try:
            encoded = base64.b64encode(data).decode("ascii")
            photo = tk.PhotoImage(data=encoded)
            factor = max(
                1,
                (photo.width() + self.max_size[0] - 1) // self.max_size[0],
                (photo.height() + self.max_size[1] - 1) // self.max_size[1],
            )
            if factor > 1:
                photo = photo.subsample(factor, factor)
            self.photo = photo
            self.stage.configure(image=photo, text="")
        except tk.TclError:
            self.stage.configure(image="", text=f"{key}\nPreview needs Pillow for this image format.")

    def _preview_failed(self, error: str, request_id: int) -> None:
        if request_id != self.request_id:
            return
        self.stage.configure(image="", text="Preview unavailable")
        self.status.configure(text=error)

    def move(self, delta: int) -> None:
        if self.selected.get():
            self.status.configure(text="Selected image is frozen. Uncheck ✓ Select to keep browsing.")
            return
        if not self.objects:
            return
        self.index = (self.index + delta) % len(self.objects)
        self.show_current()

    def _selection_changed(self) -> None:
        if not self.selected.get():
            self._set_nav(bool(self.objects))
            self.status.configure(text="Browsing unlocked.")
            return
        if not self.objects:
            self.selected.set(False)
            return
        if not self.public_base:
            self.selected.set(False)
            self.status.configure(text="cloudfare.txt needs public_base_url, or the bucket needs an enabled public domain.")
            return
        key = str(self.objects[self.index].get("key") or "")
        self.select_callback(self._public_url(key), key)
        self._set_nav(False)
        self.status.configure(text="Selected and frozen. Uncheck ✓ Select to keep browsing.")

    def _set_nav(self, enabled: bool) -> None:
        state = "normal" if enabled and not self.selected.get() else "disabled"
        self.prev_button.configure(state=state)
        self.next_button.configure(state=state)


class VisualPortfolioBuilder(CredentialMediaPortfolioBuilder):
    def __init__(self, initial_path: Path | None = None) -> None:
        self.page_style_vars: dict[tuple[str, str], tk.StringVar] = {}
        self.page_style_rows: dict[tuple[str, str], int] = {}
        self.page_color_buttons: dict[tuple[str, str], tk.Button] = {}
        self.section_size_widgets: dict[int, dict[str, ttk.Combobox]] = {}
        self.block_media_viewer: EmbeddedMediaViewer | None = None
        self.section_media_viewers: dict[int, EmbeddedMediaViewer] = {}
        super().__init__(initial_path)

    # ---------- visual UI ----------

    def _build_ui(self) -> None:
        # Start from the clean base UI; add only one R2 credential-file control.
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
            ttk.Entry(publishing, textvariable=self.r2_credentials_location).grid(row=4, column=1, sticky="ew", padx=8)
            ttk.Button(publishing, text="Browse…", command=self.choose_r2_credentials_location).grid(row=4, column=2)
            ttk.Button(publishing, text="Save R2", command=self.save_r2_settings).grid(row=4, column=3, padx=(8, 0))
            ttk.Label(
                publishing,
                text="cloudfare.txt contains token, account_id, public_base_url, and optional default location.",
                foreground="#666",
            ).grid(row=5, column=0, columnspan=4, sticky="w", pady=(5, 0))

        # Compact block image viewer comes before every normal block field.
        block_inner = self.block_entries["order"].master
        first_child = block_inner.winfo_children()[0]
        media_holder = ttk.Frame(block_inner)
        media_holder.pack(fill="x", before=first_child, pady=(0, 8))

        location_holder = ttk.Frame(block_inner)
        location_holder.pack(fill="x", after=media_holder, before=first_child, pady=(0, 10))
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

    def _install_page_intro_style_controls(self) -> None:
        for page_key in ("acting", "design", "contact"):
            for field_key, prefix in (("title", "title"), ("kicker", "kicker"), ("body", "body")):
                text_widget = self.page_entries.get((page_key, field_key))
                if text_widget is None:
                    continue
                strip = ttk.LabelFrame(text_widget.master, text=f"{field_key.title()} style", padding=7)
                strip.pack(fill="x", after=text_widget, pady=(4, 8))
                self._build_style_strip(strip, page_key, prefix)

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
        ttk.Combobox(parent, textvariable=tag_var, values=TEXT_TAGS, state="readonly", width=7).grid(row=1, column=0, sticky="w", padx=(0, 8))

        ttk.Label(parent, text="Color").grid(row=0, column=1, sticky="w")
        swatch = tk.Button(parent, text="Choose…", width=10, command=lambda p=page_key, x=prefix: self._choose_page_color(p, x))
        swatch.grid(row=1, column=1, sticky="w", padx=(0, 8))
        self.page_color_buttons[(page_key, prefix)] = swatch

        ttk.Label(parent, text="Size (px)").grid(row=0, column=2, sticky="w")
        ttk.Combobox(parent, textvariable=size_var, values=SIZE_CHOICES, width=8).grid(row=1, column=2, sticky="w", padx=(0, 8))

        ttk.Label(parent, text="Google Font URL").grid(row=0, column=3, sticky="w")
        ttk.Entry(parent, textvariable=font_var).grid(row=1, column=3, sticky="ew")
        parent.columnconfigure(3, weight=1)

    def _choose_page_color(self, page_key: str, prefix: str) -> None:
        var = self.page_style_vars[(page_key, f"{prefix}_color")]
        _rgb, value = colorchooser.askcolor(color=var.get() or None, parent=self)
        if value:
            var.set(value)
            self._paint_color_button(page_key, prefix, value)

    def _paint_color_button(self, page_key: str, prefix: str, value: str) -> None:
        button = self.page_color_buttons.get((page_key, prefix))
        if button is None:
            return
        if value:
            button.configure(bg=value, activebackground=value, text="Choose…")
        else:
            button.configure(bg="SystemButtonFace", activebackground="SystemButtonFace", text="Choose…")

    # ---------- page style CSV rows ----------

    def _ensure_page_style_rows(self) -> None:
        existing: dict[tuple[str, str], int] = {}
        for index, row in enumerate(self.rows):
            if row.get("record_type") != "page_style":
                continue
            key = ((row.get("product_id") or "").strip().lower(), (row.get("title") or "").strip())
            if all(key):
                existing[key] = index
        for page_key in ("acting", "design", "contact"):
            for field_key, default in PAGE_STYLE_DEFAULTS.items():
                key = (page_key, field_key)
                if key in existing:
                    continue
                row = self._new_csv_row()
                row.update(record_type="page_style", product_id=page_key, title=field_key, description=default)
                self.rows.append(row)
                existing[key] = len(self.rows) - 1
        self.page_style_rows = existing

    def _load_page_styles(self) -> None:
        for key, var in self.page_style_vars.items():
            row_index = self.page_style_rows.get(key)
            value = self.rows[row_index].get("description", "") if row_index is not None else ""
            var.set(value or "")
        for page_key in ("acting", "design", "contact"):
            for prefix in ("title", "kicker", "body"):
                self._paint_color_button(page_key, prefix, self.page_style_vars[(page_key, f"{prefix}_color")].get())

    def _commit_page_styles(self) -> None:
        for key, var in self.page_style_vars.items():
            row_index = self.page_style_rows.get(key)
            if row_index is not None:
                self.rows[row_index]["description"] = var.get().strip()

    # ---------- block + section embedded media ----------

    def _select_block_media(self, url: str, key: str) -> None:
        widget_set(self.block_entries["image_url"], url)
        if not widget_get(self.block_entries["image_alt"]).strip():
            widget_set(self.block_entries["image_alt"], Path(key).stem.replace("-", " ").replace("_", " "))
        if self.current_block_position is not None:
            row_index = self.block_indices[self.current_block_position]
            self.rows[row_index]["image_url"] = url
            self.rows[row_index][R2_COLUMN] = widget_get(self.block_entries[R2_COLUMN]).strip()
        self.status_text.set(f"Selected R2 image: {key}")

    def _select_section_media(self, row_index: int, url: str, key: str) -> None:
        widgets = self.section_widgets.get(row_index)
        if widgets:
            widget_set(widgets["image_url"], url)
            if not widget_get(widgets["image_alt"]).strip():
                widget_set(widgets["image_alt"], Path(key).stem.replace("-", " ").replace("_", " "))
        if row_index < len(self.rows):
            self.rows[row_index]["image_url"] = url
        self.status_text.set(f"Selected R2 image: {key}")

    def _public_url_from_base(self, base: str, key: str) -> str:
        import urllib.parse
        return f"{base.rstrip('/')}/{urllib.parse.quote(key, safe='/')}"

    def _load_block(self, position: int) -> None:
        PortfolioBuilder._load_block(self, position)
        if self.block_media_viewer is not None:
            self.after(20, self.block_media_viewer.refresh)

    def _rebuild_section_editors(self) -> None:
        self.section_media_entries = {}
        self.section_media_viewers = {}
        self.section_size_widgets = {}
        PortfolioBuilder._rebuild_section_editors(self)

    def _build_section_card(self, parent: ttk.Frame, row_index: int) -> None:
        PortfolioBuilder._build_section_card(self, parent, row_index)
        widgets = self.section_widgets.get(row_index)
        if not widgets:
            return
        card = widgets["image_url"].master

        # Shift the original form down so the image viewport is the first thing seen.
        for child in card.grid_slaves():
            info = child.grid_info()
            child.grid_configure(row=int(info.get("row", 0)) + 5)

        viewer_holder = ttk.Frame(card)
        viewer_holder.grid(row=0, column=0, columnspan=3, sticky="ew", pady=(0, 7))
        card.columnconfigure(1, weight=1)

        ttk.Label(card, text="R2 location override (optional)").grid(row=1, column=0, sticky="w", pady=3)
        location = ttk.Entry(card)
        location.grid(row=1, column=1, columnspan=2, sticky="ew", pady=3)
        widget_set(location, self.rows[row_index].get(R2_COLUMN, "") or "")
        self.section_media_entries[row_index] = location

        viewer = EmbeddedMediaViewer(
            self,
            viewer_holder,
            "Image",
            location_getter=lambda i=row_index: self.section_media_entries[i].get(),
            current_url_getter=lambda i=row_index: widget_get(self.section_widgets[i]["image_url"]),
            select_callback=lambda url, key, i=row_index: self._select_section_media(i, url, key),
            max_size=(540, 220),
        )
        viewer.frame.pack(fill="x")
        self.section_media_viewers[row_index] = viewer

        # Font-size controls supplement the existing type/color/font controls.
        bottom_row = max((int(child.grid_info().get("row", 0)) for child in card.grid_slaves()), default=1) + 1
        size_box = ttk.LabelFrame(card, text="Text sizes", padding=7)
        size_box.grid(row=bottom_row, column=0, columnspan=3, sticky="ew", pady=(8, 0))
        size_widgets: dict[str, ttk.Combobox] = {}
        for column, (key, label) in enumerate((("header_size", "Header"), ("subheader_size", "Subheader"), ("body_size", "Body"))):
            ttk.Label(size_box, text=label).grid(row=0, column=column, sticky="w", padx=(0, 8))
            combo = ttk.Combobox(size_box, values=SIZE_CHOICES, width=9)
            combo.grid(row=1, column=column, sticky="w", padx=(0, 8))
            widget_set(combo, self.rows[row_index].get(SECTION_SIZE_COLUMNS[key], "") or "")
            size_widgets[key] = combo
        self.section_size_widgets[row_index] = size_widgets

        # Make the existing color buttons unmistakably visual.
        for child in card.grid_slaves():
            if isinstance(child, ttk.Button) and child.cget("text") == "Pick…":
                child.configure(text="🎨 Choose Color")

        self.after(30, viewer.refresh)

    def _commit_sections(self) -> None:
        PortfolioBuilder._commit_sections(self)
        for row_index, entry in self.section_media_entries.items():
            if row_index < len(self.rows):
                self.rows[row_index][R2_COLUMN] = entry.get().strip()
        for row_index, widgets in self.section_size_widgets.items():
            if row_index >= len(self.rows):
                continue
            for key, widget in widgets.items():
                self.rows[row_index][SECTION_SIZE_COLUMNS[key]] = widget_get(widget).strip()

    # ---------- lifecycle ----------

    def load_file(self, path: Path) -> None:
        super().load_file(path)
        if not self.fieldnames:
            return
        for column in SECTION_SIZE_COLUMNS.values():
            if column not in self.fieldnames:
                self.fieldnames.append(column)
        for row in self.rows:
            for column in SECTION_SIZE_COLUMNS.values():
                row.setdefault(column, "")
        self._ensure_page_style_rows()
        self._load_page_styles()
        self._rebuild_section_editors()
        if self.current_block_position is not None:
            self._load_block(self.current_block_position)

    def _commit_all(self) -> None:
        PortfolioBuilder._commit_all(self)
        self._commit_page_styles()
        self._commit_sections()

    def save_r2_settings(self) -> None:
        super().save_r2_settings()
        if self.block_media_viewer is not None:
            self.block_media_viewer.refresh()
        for viewer in self.section_media_viewers.values():
            viewer.refresh()


def main() -> None:
    import sys
    initial = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else None
    VisualPortfolioBuilder(initial).mainloop()


if __name__ == "__main__":
    main()
