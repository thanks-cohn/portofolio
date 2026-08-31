#!/usr/bin/env python3
"""R2-aware Quandranea portfolio builder.

Extends the CSV-first Tkinter builder with an in-window Cloudflare R2 media
browser. No separate image-picker window is created: the existing GUI is
covered by an in-app lightbox frame while browsing.
"""

from __future__ import annotations

import base64
import json
import re
import sys
import threading
import tkinter as tk
import urllib.error
import urllib.parse
import urllib.request
from io import BytesIO
from pathlib import Path
from tkinter import filedialog, ttk

from portfolio_builder import (
    CONFIG_PATH,
    GithubFailure,
    PortfolioBuilder,
    widget_get,
    widget_set,
)

try:
    from PIL import Image, ImageTk  # type: ignore
except ImportError:  # Pillow is optional for PNG/GIF, recommended for JPG/WebP.
    Image = None
    ImageTk = None

IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".bmp", ".tif", ".tiff")
R2_COLUMN = "r2_location"


class R2Failure(RuntimeError):
    pass


class MediaPortfolioBuilder(PortfolioBuilder):
    def __init__(self, initial_path: Path | None = None) -> None:
        self._media_config: dict[str, str] = {}
        self.section_media_entries: dict[int, ttk.Entry] = {}
        self._media_target: tuple[str, int] | None = None
        self._media_bucket = ""
        self._media_prefix = ""
        self._media_public_base = ""
        self._media_objects: list[dict] = []
        self._media_index = 0
        self._media_cache: dict[str, bytes] = {}
        self._media_photo = None
        self._media_request_id = 0
        super().__init__(initial_path)

    # ---------- config + UI extension ----------

    def _load_config(self) -> dict[str, str]:
        config = super()._load_config()
        self._media_config = config
        return config

    def _save_config(self) -> None:
        data = {
            "token_location": self.token_location.get().strip() or "NULL",
            "r2_token_location": getattr(self, "r2_token_location", tk.StringVar(value="NULL")).get().strip() or "NULL",
            "r2_account_id": getattr(self, "r2_account_id", tk.StringVar(value="")).get().strip(),
            "r2_public_base_url": getattr(self, "r2_public_base_url", tk.StringVar(value="")).get().strip(),
        }
        CONFIG_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def _build_ui(self) -> None:
        super()._build_ui()
        config = self._media_config
        self.r2_token_location = tk.StringVar(value=config.get("r2_token_location", "NULL"))
        self.r2_account_id = tk.StringVar(value=config.get("r2_account_id", ""))
        self.r2_public_base_url = tk.StringVar(value=config.get("r2_public_base_url", ""))

        publishing = next(
            (child for child in self.winfo_children() if isinstance(child, ttk.LabelFrame) and child.cget("text") == "Website publishing"),
            None,
        )
        if publishing is not None:
            ttk.Separator(publishing).grid(row=3, column=0, columnspan=4, sticky="ew", pady=(10, 8))
            ttk.Label(publishing, text="R2 TOKEN LOCATION:").grid(row=4, column=0, sticky="w")
            ttk.Entry(publishing, textvariable=self.r2_token_location).grid(row=4, column=1, sticky="ew", padx=8)
            ttk.Button(publishing, text="Browse…", command=self.choose_r2_token_location).grid(row=4, column=2)
            ttk.Button(publishing, text="Save R2", command=self.save_r2_settings).grid(row=4, column=3, padx=(8, 0))

            ttk.Label(publishing, text="R2 ACCOUNT ID:").grid(row=5, column=0, sticky="w", pady=(6, 0))
            ttk.Entry(publishing, textvariable=self.r2_account_id).grid(row=5, column=1, sticky="ew", padx=8, pady=(6, 0))
            ttk.Label(publishing, text="Token file contains only the Cloudflare API token.", foreground="#666").grid(
                row=5, column=2, columnspan=2, sticky="w", padx=(8, 0), pady=(6, 0)
            )

            ttk.Label(publishing, text="R2 PUBLIC BASE URL:").grid(row=6, column=0, sticky="w", pady=(6, 0))
            ttk.Entry(publishing, textvariable=self.r2_public_base_url).grid(row=6, column=1, sticky="ew", padx=8, pady=(6, 0))
            ttk.Label(
                publishing,
                text="Optional custom/R2 public domain. If blank, the editor tries the bucket's enabled r2.dev domain.",
                foreground="#666",
            ).grid(row=6, column=2, columnspan=2, sticky="w", padx=(8, 0), pady=(6, 0))

        # Add a per-block R2 location immediately beneath the normal block fields.
        block_inner = self.block_entries["image_url"].master
        ttk.Separator(block_inner).pack(fill="x", pady=(18, 10))
        ttk.Label(block_inner, text="R2 bucket/location").pack(anchor="w", pady=(0, 4))
        block_r2 = ttk.Entry(block_inner)
        block_r2.pack(fill="x")
        self.block_entries[R2_COLUMN] = block_r2
        ttk.Button(block_inner, text="Browse Images", command=self.browse_selected_block_images).pack(anchor="w", pady=(8, 4))
        ttk.Label(
            block_inner,
            text="Example: my-bucket/portfolio/landing. Browse stays inside this GUI.",
            foreground="#666",
        ).pack(anchor="w")

        self._build_media_overlay()
        self.bind("<Left>", self._media_left_key, add="+")
        self.bind("<Right>", self._media_right_key, add="+")
        self.bind("<Escape>", self._media_escape_key, add="+")

    def choose_r2_token_location(self) -> None:
        filename = filedialog.askopenfilename(
            title="Choose local text file containing Cloudflare R2 API token",
            filetypes=[("Text files", "*.txt"), ("All files", "*.*")],
        )
        if filename:
            self.r2_token_location.set(filename)
            self.save_r2_settings()

    def save_r2_settings(self) -> None:
        self.r2_token_location.set(self.r2_token_location.get().strip() or "NULL")
        self.r2_account_id.set(self.r2_account_id.get().strip())
        self.r2_public_base_url.set(self.r2_public_base_url.get().strip())
        try:
            self._save_config()
            self.status_text.set("R2 settings saved")
        except OSError as exc:
            self.status_text.set(f"Could not save R2 settings: {exc}")

    # ---------- CSV compatibility ----------

    def load_file(self, path: Path) -> None:
        super().load_file(path)
        if not self.fieldnames:
            return
        if R2_COLUMN not in self.fieldnames:
            self.fieldnames.append(R2_COLUMN)
        for row in self.rows:
            row.setdefault(R2_COLUMN, "")
        self._rebuild_section_editors()
        if self.current_block_position is not None:
            self._load_block(self.current_block_position)

    def _rebuild_section_editors(self) -> None:
        self.section_media_entries = {}
        super()._rebuild_section_editors()

    def _build_section_card(self, parent: ttk.Frame, row_index: int) -> None:
        super()._build_section_card(parent, row_index)
        widgets = self.section_widgets.get(row_index)
        if not widgets:
            return
        card = widgets["image_url"].master
        last_row = max((int(child.grid_info().get("row", 0)) for child in card.grid_slaves()), default=0) + 1
        ttk.Separator(card).grid(row=last_row, column=0, columnspan=3, sticky="ew", pady=(12, 8))
        ttk.Label(card, text="R2 bucket/location").grid(row=last_row + 1, column=0, sticky="w", pady=4)
        location = ttk.Entry(card)
        location.grid(row=last_row + 1, column=1, sticky="ew", pady=4)
        widget_set(location, self.rows[row_index].get(R2_COLUMN, "") or "")
        ttk.Button(card, text="Browse Images", command=lambda i=row_index: self.browse_section_images(i)).grid(
            row=last_row + 1, column=2, padx=(8, 0), pady=4
        )
        self.section_media_entries[row_index] = location

    def _commit_sections(self) -> None:
        super()._commit_sections()
        for row_index, entry in self.section_media_entries.items():
            if row_index < len(self.rows):
                self.rows[row_index][R2_COLUMN] = entry.get().strip()

    # ---------- R2 API ----------

    def _read_r2_token(self) -> str:
        location = self.r2_token_location.get().strip()
        if not location or location.upper() == "NULL":
            raise R2Failure("R2 TOKEN LOCATION is NULL. Choose the local token text file first.")
        path = Path(location).expanduser()
        if not path.is_file():
            raise R2Failure(f"R2 token file was not found: {path}")
        token = path.read_text(encoding="utf-8").strip()
        if not token:
            raise R2Failure("The R2 token file is empty.")
        lower = token.lower()
        if lower.startswith("bearer "):
            token = token[7:].strip()
        return token

    def _r2_account(self) -> str:
        account = self.r2_account_id.get().strip()
        if not account:
            raise R2Failure("R2 ACCOUNT ID is blank.")
        return account

    def _parse_r2_location(self, value: str) -> tuple[str, str]:
        cleaned = value.strip().strip("/")
        if not cleaned:
            raise R2Failure("Enter an R2 bucket/location first, for example: bucket/portfolio/design")
        bucket, slash, prefix = cleaned.partition("/")
        if not re.fullmatch(r"[A-Za-z0-9._-]{3,64}", bucket):
            raise R2Failure("The first part of R2 bucket/location must be a valid bucket name.")
        return bucket, prefix if slash else ""

    def _cf_request(self, url: str, expect_json: bool = True) -> dict | bytes:
        request = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {self._read_r2_token()}",
                "Accept": "application/json" if expect_json else "*/*",
                "User-Agent": "Quandranea-Portfolio-Builder",
            },
            method="GET",
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                raw = response.read()
                if not expect_json:
                    return raw
                return json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = str(exc)
            try:
                payload = json.loads(exc.read().decode("utf-8"))
                errors = payload.get("errors") or []
                if errors:
                    detail = errors[0].get("message") or detail
            except Exception:
                pass
            raise R2Failure(f"Cloudflare returned {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise R2Failure(f"Could not reach Cloudflare R2: {exc.reason}") from exc

    def _r2_api_base(self, bucket: str) -> str:
        account = urllib.parse.quote(self._r2_account(), safe="")
        encoded_bucket = urllib.parse.quote(bucket, safe="")
        return f"https://api.cloudflare.com/client/v4/accounts/{account}/r2/buckets/{encoded_bucket}"

    def _r2_list_images(self, bucket: str, prefix: str) -> list[dict]:
        objects: list[dict] = []
        cursor = ""
        while True:
            params = {"per_page": "1000"}
            if prefix:
                params["prefix"] = prefix
            if cursor:
                params["cursor"] = cursor
            url = f"{self._r2_api_base(bucket)}/objects?{urllib.parse.urlencode(params)}"
            payload = self._cf_request(url, expect_json=True)
            if not isinstance(payload, dict) or not payload.get("success"):
                raise R2Failure("R2 did not return a successful object listing.")
            for item in payload.get("result") or []:
                key = str(item.get("key") or "")
                content_type = str((item.get("http_metadata") or {}).get("contentType") or "")
                if content_type.lower().startswith("image/") or key.lower().endswith(IMAGE_EXTENSIONS):
                    objects.append(item)
            info = payload.get("result_info") or {}
            if not info.get("is_truncated"):
                break
            cursor = str(info.get("cursor") or "")
            if not cursor or len(objects) >= 5000:
                break
        objects.sort(key=lambda item: str(item.get("key") or "").lower())
        return objects

    def _r2_get_object_bytes(self, bucket: str, key: str) -> bytes:
        encoded_key = urllib.parse.quote(key, safe="/")
        url = f"{self._r2_api_base(bucket)}/objects/{encoded_key}"
        result = self._cf_request(url, expect_json=False)
        if not isinstance(result, bytes):
            raise R2Failure("R2 object response was not binary data.")
        return result

    def _r2_public_base_for_bucket(self, bucket: str) -> str:
        configured = self.r2_public_base_url.get().strip()
        if configured:
            return configured.replace("{bucket}", bucket).rstrip("/")
        url = f"{self._r2_api_base(bucket)}/domains/managed"
        payload = self._cf_request(url, expect_json=True)
        if isinstance(payload, dict) and payload.get("success"):
            result = payload.get("result") or {}
            domain = str(result.get("domain") or "").strip()
            if result.get("enabled") and domain:
                return f"https://{domain}".rstrip("/")
        return ""

    # ---------- in-GUI media lightbox ----------

    def _build_media_overlay(self) -> None:
        overlay = tk.Frame(self, bg="#111111", highlightthickness=0)
        self.media_overlay = overlay

        top = tk.Frame(overlay, bg="#111111")
        top.pack(fill="x", padx=18, pady=(16, 8))
        self.media_location_label = tk.Label(top, text="R2 Media", bg="#111111", fg="#f1eee7", anchor="w")
        self.media_location_label.pack(side="left", fill="x", expand=True)
        ttk.Button(top, text="Back to Editor", command=self._close_media_browser).pack(side="right")

        stage = tk.Frame(overlay, bg="#090909")
        stage.pack(fill="both", expand=True, padx=18, pady=8)
        self.media_image_label = tk.Label(
            stage,
            text="Choose an R2 location and browse.",
            bg="#090909",
            fg="#d8d4cd",
            compound="center",
            justify="center",
            font=("TkDefaultFont", 12),
        )
        self.media_image_label.pack(fill="both", expand=True, padx=20, pady=20)

        self.media_filename_label = tk.Label(overlay, text="", bg="#111111", fg="#c2beb7", anchor="center")
        self.media_filename_label.pack(fill="x", padx=18, pady=(0, 4))
        self.media_status_label = tk.Label(overlay, text="", bg="#111111", fg="#8d8982", anchor="center")
        self.media_status_label.pack(fill="x", padx=18, pady=(0, 8))

        bottom = tk.Frame(overlay, bg="#111111")
        bottom.pack(fill="x", padx=18, pady=(4, 18))
        self.media_selected = tk.BooleanVar(value=False)
        self.media_select_check = tk.Checkbutton(
            bottom,
            text="✓ Select",
            variable=self.media_selected,
            command=self._media_select_changed,
            bg="#111111",
            fg="#f1eee7",
            selectcolor="#262626",
            activebackground="#111111",
            activeforeground="#ffffff",
            anchor="w",
            padx=4,
        )
        self.media_select_check.pack(side="left")
        nav = tk.Frame(bottom, bg="#111111")
        nav.pack(side="right")
        self.media_prev_button = ttk.Button(nav, text="← Previous", command=lambda: self._media_move(-1))
        self.media_prev_button.pack(side="left")
        self.media_counter = tk.Label(nav, text="0 / 0", bg="#111111", fg="#f1eee7", width=12)
        self.media_counter.pack(side="left", padx=10)
        self.media_next_button = ttk.Button(nav, text="Next →", command=lambda: self._media_move(1))
        self.media_next_button.pack(side="left")

    def browse_selected_block_images(self) -> None:
        if self.current_block_position is None:
            self.status_text.set("Select a rotunda block first")
            return
        self._commit_block()
        row_index = self.block_indices[self.current_block_position]
        location = self.rows[row_index].get(R2_COLUMN, "") or widget_get(self.block_entries[R2_COLUMN])
        self._begin_media_browser(("block", row_index), location)

    def browse_section_images(self, row_index: int) -> None:
        self._commit_sections()
        location = self.rows[row_index].get(R2_COLUMN, "")
        self._begin_media_browser(("section", row_index), location)

    def _begin_media_browser(self, target: tuple[str, int], location: str) -> None:
        try:
            bucket, prefix = self._parse_r2_location(location)
            self._r2_account()
            self._read_r2_token()
        except R2Failure as exc:
            self.status_text.set(str(exc))
            return

        self._media_target = target
        self._media_bucket = bucket
        self._media_prefix = prefix
        self._media_public_base = ""
        self._media_objects = []
        self._media_index = 0
        self._media_cache = {}
        self._media_photo = None
        self.media_selected.set(False)
        self._set_media_locked(False)
        self.media_location_label.configure(text=f"R2: {bucket}/{prefix}" if prefix else f"R2: {bucket}")
        self.media_filename_label.configure(text="")
        self.media_status_label.configure(text="Loading images from R2…")
        self.media_image_label.configure(image="", text="Loading media library…")
        self.media_counter.configure(text="0 / 0")
        self.media_overlay.place(relx=0, rely=0, relwidth=1, relheight=1)
        self.media_overlay.lift()
        self.media_overlay.focus_set()

        def worker() -> None:
            try:
                objects = self._r2_list_images(bucket, prefix)
                public_base = self._r2_public_base_for_bucket(bucket)
                self.after(0, lambda: self._media_listing_ready(objects, public_base))
            except R2Failure as exc:
                self.after(0, lambda: self._media_listing_failed(str(exc)))

        threading.Thread(target=worker, daemon=True).start()

    def _media_listing_ready(self, objects: list[dict], public_base: str) -> None:
        self._media_objects = objects
        self._media_public_base = public_base
        if not objects:
            self.media_image_label.configure(text="No images found in this R2 location.", image="")
            self.media_status_label.configure(text="Change bucket/location, then browse again.")
            self._set_media_nav_enabled(False)
            return
        self._set_media_nav_enabled(True)
        self._media_index = self._matching_current_image_index()
        self._show_media_current()

    def _media_listing_failed(self, error: str) -> None:
        self.media_image_label.configure(text="Could not load this R2 location.", image="")
        self.media_status_label.configure(text=error)
        self._set_media_nav_enabled(False)

    def _matching_current_image_index(self) -> int:
        current_url = ""
        if self._media_target:
            kind, row_index = self._media_target
            if kind == "block" and row_index < len(self.rows):
                current_url = self.rows[row_index].get("image_url", "") or ""
            elif kind == "section" and row_index < len(self.rows):
                current_url = self.rows[row_index].get("image_url", "") or ""
        if current_url and self._media_public_base:
            for index, item in enumerate(self._media_objects):
                if self._public_url(str(item.get("key") or "")) == current_url:
                    return index
        return 0

    def _show_media_current(self) -> None:
        if not self._media_objects:
            return
        item = self._media_objects[self._media_index]
        key = str(item.get("key") or "")
        self.media_counter.configure(text=f"{self._media_index + 1} / {len(self._media_objects)}")
        self.media_filename_label.configure(text=key)
        self.media_status_label.configure(text="Loading preview…")
        self.media_image_label.configure(image="", text="Loading image…")
        self._media_request_id += 1
        request_id = self._media_request_id

        cached = self._media_cache.get(key)
        if cached is not None:
            self._render_media_bytes(key, cached, request_id)
            return

        def worker() -> None:
            try:
                data = self._r2_get_object_bytes(self._media_bucket, key)
                self._media_cache[key] = data
                self.after(0, lambda: self._render_media_bytes(key, data, request_id))
            except R2Failure as exc:
                self.after(0, lambda: self._media_preview_failed(str(exc), request_id))

        threading.Thread(target=worker, daemon=True).start()

    def _render_media_bytes(self, key: str, data: bytes, request_id: int) -> None:
        if request_id != self._media_request_id:
            return
        self._media_photo = None
        if Image is not None and ImageTk is not None:
            try:
                image = Image.open(BytesIO(data))
                image.thumbnail((1050, 650), Image.Resampling.LANCZOS)
                photo = ImageTk.PhotoImage(image)
                self._media_photo = photo
                self.media_image_label.configure(image=photo, text="")
                self.media_status_label.configure(text="Check ✓ Select to pair and freeze this image.")
                return
            except Exception:
                pass

        # Native Tk supports PNG/GIF on common Tk 8.6 installations.
        try:
            encoded = base64.b64encode(data).decode("ascii")
            photo = tk.PhotoImage(data=encoded)
            max_w, max_h = 1050, 650
            factor = max(1, (photo.width() + max_w - 1) // max_w, (photo.height() + max_h - 1) // max_h)
            if factor > 1:
                photo = photo.subsample(factor, factor)
            self._media_photo = photo
            self.media_image_label.configure(image=photo, text="")
            self.media_status_label.configure(text="Check ✓ Select to pair and freeze this image.")
        except tk.TclError:
            self.media_image_label.configure(
                image="",
                text=f"{key}\n\nPreview for this format needs Pillow.\nRun: py -m pip install pillow\n\nYou can still select the object.",
            )
            self.media_status_label.configure(text="Check ✓ Select to pair this object even without a preview.")

    def _media_preview_failed(self, error: str, request_id: int) -> None:
        if request_id != self._media_request_id:
            return
        self.media_image_label.configure(image="", text="Preview unavailable")
        self.media_status_label.configure(text=error)

    def _media_move(self, delta: int) -> None:
        if self.media_selected.get():
            self.media_status_label.configure(text="Selected image is frozen. Uncheck ✓ Select to continue browsing.")
            return
        if not self._media_objects:
            return
        self._media_index = (self._media_index + delta) % len(self._media_objects)
        self._show_media_current()

    def _media_select_changed(self) -> None:
        locked = self.media_selected.get()
        if not locked:
            self._set_media_locked(False)
            self.media_status_label.configure(text="Browsing unlocked. Use ← / → to continue through the images.")
            return
        if not self._media_objects:
            self.media_selected.set(False)
            return
        if not self._media_public_base:
            self.media_selected.set(False)
            self._set_media_locked(False)
            self.media_status_label.configure(
                text="This bucket has no usable public base URL. Set R2 PUBLIC BASE URL or enable its r2.dev domain."
            )
            return

        item = self._media_objects[self._media_index]
        key = str(item.get("key") or "")
        url = self._public_url(key)
        self._apply_media_selection(url, key)
        self._set_media_locked(True)
        self.media_status_label.configure(text="Selected and frozen. Uncheck ✓ Select to browse another image.")

    def _set_media_locked(self, locked: bool) -> None:
        state = "disabled" if locked else "normal"
        if self._media_objects or locked:
            self.media_prev_button.configure(state=state)
            self.media_next_button.configure(state=state)

    def _set_media_nav_enabled(self, enabled: bool) -> None:
        state = "normal" if enabled and not self.media_selected.get() else "disabled"
        self.media_prev_button.configure(state=state)
        self.media_next_button.configure(state=state)

    def _public_url(self, key: str) -> str:
        return f"{self._media_public_base.rstrip('/')}/{urllib.parse.quote(key, safe='/')}"

    def _apply_media_selection(self, url: str, key: str) -> None:
        if not self._media_target:
            return
        kind, row_index = self._media_target
        alt_default = Path(key).stem.replace("-", " ").replace("_", " ").strip()
        if kind == "block":
            widget_set(self.block_entries["image_url"], url)
            if not widget_get(self.block_entries["image_alt"]).strip():
                widget_set(self.block_entries["image_alt"], alt_default)
            if row_index < len(self.rows):
                self.rows[row_index]["image_url"] = url
                if not (self.rows[row_index].get("image_alt") or "").strip():
                    self.rows[row_index]["image_alt"] = alt_default
        elif kind == "section":
            widgets = self.section_widgets.get(row_index)
            if widgets:
                widget_set(widgets["image_url"], url)
                if not widget_get(widgets["image_alt"]).strip():
                    widget_set(widgets["image_alt"], alt_default)
            if row_index < len(self.rows):
                self.rows[row_index]["image_url"] = url
                if not (self.rows[row_index].get("image_alt") or "").strip():
                    self.rows[row_index]["image_alt"] = alt_default
        self.status_text.set(f"Paired R2 image: {key}")

    def _close_media_browser(self) -> None:
        self.media_overlay.place_forget()
        self._media_photo = None
        self._media_request_id += 1
        self.status_text.set("Returned to editor; save or publish when ready")

    def _media_left_key(self, _event: tk.Event):
        if self.media_overlay.winfo_ismapped():
            self._media_move(-1)
            return "break"
        return None

    def _media_right_key(self, _event: tk.Event):
        if self.media_overlay.winfo_ismapped():
            self._media_move(1)
            return "break"
        return None

    def _media_escape_key(self, _event: tk.Event):
        if self.media_overlay.winfo_ismapped():
            self._close_media_browser()
            return "break"
        return None


def main() -> None:
    initial = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else None
    MediaPortfolioBuilder(initial).mainloop()


if __name__ == "__main__":
    main()
