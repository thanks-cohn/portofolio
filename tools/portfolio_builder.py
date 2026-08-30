#!/usr/bin/env python3
"""Quandranea visual portfolio builder.

Standard-library-only Tkinter CMS for truth.csv.

The CSV remains the source of truth. This program edits it locally, can publish
it to GitHub with a fine-grained PAT stored in a separate local text file, and
can restore standard.csv. It can also add new rotunda blocks and configurable
image/text sections to ACTING, DESIGN, and CONTACT.
"""

from __future__ import annotations

import base64
import csv
import json
import re
import shutil
import sys
import tkinter as tk
import urllib.error
import urllib.parse
import urllib.request
from io import StringIO
from pathlib import Path
from tkinter import colorchooser, filedialog, messagebox, ttk

CONFIG_PATH = Path.home() / ".quandranea_truth_editor.json"
REPOSITORY = "thanks-cohn/portofolio"
BRANCH = "main"
REMOTE_TRUTH = "truth.csv"
REMOTE_STANDARD = "standard.csv"

AVAILABILITY = [
    "available", "low_stock", "sold_out", "temporarily_unavailable",
    "discontinued", "preorder", "unknown", "mapping_error", "suspended",
]
TEXT_TAGS = ["p", "h1", "h2", "h3", "h4", "h5", "h6"]

GLOBAL_FIELDS = [
    ("row_heading", "Landing heading"),
    ("row_subheader", "Landing subheader"),
    ("brand_top", "Brand top"),
    ("brand_bottom", "Brand bottom"),
    ("nav_home_label", "HOME label"),
    ("nav_home_url", "HOME URL"),
    ("nav_acting_label", "ACTING label"),
    ("nav_acting_url", "ACTING URL"),
    ("nav_design_label", "DESIGN label"),
    ("nav_design_url", "DESIGN URL"),
    ("nav_resume_label", "RESUME label"),
    ("nav_resume_url", "RESUME URL"),
    ("nav_contact_label", "CONTACT label"),
    ("nav_contact_url", "CONTACT URL"),
    ("footer_left", "Footer left"),
    ("details_label", "Details action"),
    ("visit_label", "Visit action"),
    ("preview_header", "Preview header"),
    ("preview_source_prefix", "Preview source prefix"),
    ("preview_note", "Preview note"),
]

# field, label, multiline, combo values
BLOCK_FIELDS = [
    ("order", "Rotunda order", False, None),
    ("title", "Card / project title", False, None),
    ("description", "Project description", True, None),
    ("image_url", "Image URL", False, None),
    ("image_alt", "Image alt text", True, None),
    ("price_minor", "Price / display number (minor units)", False, None),
    ("currency", "Currency", False, ["usd", "eur", "gbp", "php", "cad", "aud"]),
    ("availability", "Availability", False, AVAILABILITY),
    ("destination_label", "Link label", False, None),
    ("destination_url", "Redirect URL", False, None),
    ("footer_icon_ref", "Footer icon reference", False, None),
    ("footer_icon_label", "Footer icon label", False, None),
    ("footer_icon_url", "Footer icon URL", False, None),
]

PAGE_FIELDS: dict[str, list[tuple[str, str, bool, str]]] = {
    "acting": [
        ("title", "Page title", False, "ACTING"),
        ("kicker", "Small heading", False, "Performance"),
        ("body", "Page text", True, "Selected acting work, performance credits, and material can live here. Replace this text with the work you want visitors to see."),
    ],
    "design": [
        ("title", "Page title", False, "DESIGN"),
        ("kicker", "Small heading", False, "Scenic & Visual Work"),
        ("body", "Page text", True, "A space for design practice, selected productions, visual research, process notes, and the work behind the finished scene."),
    ],
    "contact": [
        ("title", "Page title", False, "CONTACT"),
        ("kicker", "Small heading", False, "Get in touch"),
        ("body", "Page text", True, "For collaborations, production inquiries, and creative work, send a message."),
        ("email", "Email address", False, "hello@example.com"),
    ],
    "resume": [
        ("intro_title", "Opening title", False, "RESUME"),
        ("intro_hint", "Opening hint", False, "Scroll back up anytime"),
        ("name", "Name", False, "QUANDRANEA M. MAYBE"),
        ("headline", "Professional headline", False, "Scene Designer & Keeper of Improbable Rooms"),
        ("location", "Location", False, "Somewhere just offstage"),
        ("email", "Email", False, "hello@example.com"),
        ("availability", "Availability / contact note", False, "Available after intermission"),
        ("profile_heading", "Profile section heading", False, "Profile"),
        ("profile", "Profile", True, "Scene designer with a fondness for theatrical architecture, impossible entrances, practical illusions, and making a perfectly normal chair feel suspicious."),
        ("experience_heading", "Experience section heading", False, "Experience"),
        ("experience_1_role", "Job 1 — role", False, "Lead Scene Designer"),
        ("experience_1_dates", "Job 1 — dates", False, "2024–Present"),
        ("experience_1_place", "Job 1 — company / production", False, "The Department of Dramatic Entrances"),
        ("experience_1_bullets", "Job 1 — bullet points (one per line)", True, "Designed rooms that looked expensive while remaining legally just plywood.\nCoordinated scenic builds, paint treatments, prop logic, and audience sightlines.\nReduced emergency fog-machine diplomacy by a statistically meaningful amount."),
        ("experience_2_role", "Job 2 — role", False, "Assistant Scenic Designer"),
        ("experience_2_dates", "Job 2 — dates", False, "2022–2024"),
        ("experience_2_place", "Job 2 — company / production", False, "The Very Serious Players"),
        ("experience_2_bullets", "Job 2 — bullet points (one per line)", True, "Prepared drafting packages, research boards, models, and production notes.\nTracked scenic changes through rehearsals without losing the one important stool.\nMaintained calm when someone said “what if the wall simply flew away?”"),
        ("credits_heading", "Credits section heading", False, "Selected Credits"),
        ("credits", "Selected credits (one per line)", True, "The Chair That Knew Too Much — Scenic Design\nThree Doors, No Exit, One Snack Table — Scenic Design\nA Respectable Amount of Fog — Associate Designer\nHamlet, But the Couch Is Important — Assistant Designer"),
        ("education_heading", "Education section heading", False, "Education"),
        ("education_degree", "Degree / training", False, "B.F.A., Theatre Design"),
        ("education_year", "Education year", False, "2022"),
        ("education_school", "School", False, "University of Extremely Specific Curtains"),
        ("skills_heading", "Skills section heading", False, "Skills"),
        ("skills", "Skills", True, "Scenic design · drafting · model making · visual research · paint elevations · production collaboration · Vectorworks-adjacent confidence · emergency glitter containment"),
        ("references_heading", "References section heading", False, "References"),
        ("references", "References text", True, "Available upon request, assuming the stage manager has forgiven me."),
    ],
}

SECTION_COLUMNS = {
    "order": "order",
    "image_side": "availability",
    "image_url": "image_url",
    "image_alt": "image_alt",
    "header": "title",
    "subheader": "destination_label",
    "body": "description",
    "header_tag": "font_scope",
    "subheader_tag": "font_product_id",
    "body_tag": "color_scope",
    "header_color": "text_color",
    "subheader_color": "color_product_id",
    "body_color": "footer_icon_ref",
    "header_font_url": "destination_url",
    "subheader_font_url": "footer_icon_label",
    "body_font_url": "footer_icon_url",
}


class GithubFailure(RuntimeError):
    pass


def widget_get(widget: tk.Text | ttk.Entry | ttk.Combobox) -> str:
    return widget.get("1.0", "end-1c") if isinstance(widget, tk.Text) else widget.get()


def widget_set(widget: tk.Text | ttk.Entry | ttk.Combobox, value: str) -> None:
    if isinstance(widget, tk.Text):
        widget.delete("1.0", "end")
        widget.insert("1.0", value)
    else:
        widget.delete(0, "end")
        widget.insert(0, value)


class PortfolioBuilder(tk.Tk):
    def __init__(self, initial_path: Path | None = None) -> None:
        super().__init__()
        self.title("Quandranea Portfolio Builder")
        self.geometry("1280x900")
        self.minsize(1020, 720)

        self.path: Path | None = None
        self.fieldnames: list[str] = []
        self.rows: list[dict[str, str]] = []
        self.block_indices: list[int] = []
        self.current_block_position: int | None = None

        self.block_entries: dict[str, tk.Text | ttk.Entry | ttk.Combobox] = {}
        self.global_entries: dict[str, ttk.Entry] = {}
        self.page_entries: dict[tuple[str, str], tk.Text | ttk.Entry] = {}
        self.page_row_indices: dict[tuple[str, str], int] = {}
        self.section_hosts: dict[str, ttk.Frame] = {}
        self.section_widgets: dict[int, dict[str, tk.Text | ttk.Entry | ttk.Combobox]] = {}

        config = self._load_config()
        self.token_location = tk.StringVar(value=config.get("token_location", "NULL"))
        self.status_text = tk.StringVar(value="Ready")

        self._build_ui()

        candidate = initial_path or (Path.cwd() / REMOTE_TRUTH)
        standard = Path.cwd() / REMOTE_STANDARD
        if candidate.exists():
            self.load_file(candidate)
        elif standard.exists():
            truth_path = standard.parent / REMOTE_TRUTH
            shutil.copyfile(standard, truth_path)
            self.load_file(truth_path)
        else:
            self.after(100, self.open_file)

    # ---------- UI ----------

    def _build_ui(self) -> None:
        publishing = ttk.LabelFrame(self, text="Website publishing", padding=(12, 10))
        publishing.pack(fill="x", padx=12, pady=(12, 6))
        publishing.columnconfigure(1, weight=1)

        ttk.Label(publishing, text="TOKEN LOCATION:").grid(row=0, column=0, sticky="w")
        ttk.Entry(publishing, textvariable=self.token_location).grid(row=0, column=1, sticky="ew", padx=8)
        ttk.Button(publishing, text="Browse…", command=self.choose_token_location).grid(row=0, column=2)
        ttk.Button(publishing, text="Save Location", command=self.save_token_location).grid(row=0, column=3, padx=(8, 0))
        ttk.Label(
            publishing,
            text="Fine-grained GitHub PAT: this repository only, Contents Read/Write. Only the local token-file path is remembered.",
            foreground="#666",
        ).grid(row=1, column=0, columnspan=4, sticky="w", pady=(5, 8))

        actions = ttk.Frame(publishing)
        actions.grid(row=2, column=0, columnspan=4, sticky="ew")
        ttk.Button(actions, text="Load Latest from GitHub", command=self.load_latest_from_github).pack(side="left")
        ttk.Button(actions, text="Publish to GitHub", command=self.publish_to_github).pack(side="left", padx=(8, 0))
        ttk.Button(actions, text="Revert to Standard & Publish", command=self.revert_to_standard_and_publish).pack(side="left", padx=(8, 0))
        ttk.Label(actions, textvariable=self.status_text).pack(side="right")

        toolbar = ttk.Frame(self, padding=(12, 6))
        toolbar.pack(fill="x")
        ttk.Button(toolbar, text="Open CSV", command=self.open_file).pack(side="left")
        ttk.Button(toolbar, text="Save truth.csv", command=self.save_file).pack(side="left", padx=(8, 0))
        ttk.Button(toolbar, text="Save As…", command=self.save_as).pack(side="left", padx=(8, 0))
        self.path_label = ttk.Label(toolbar, text="No file loaded")
        self.path_label.pack(side="left", padx=18)

        body = ttk.Panedwindow(self, orient="horizontal")
        body.pack(fill="both", expand=True, padx=12, pady=(0, 12))
        left = ttk.Frame(body, padding=10)
        right = ttk.Frame(body, padding=10)
        body.add(left, weight=1)
        body.add(right, weight=4)

        block_head = ttk.Frame(left)
        block_head.pack(fill="x")
        ttk.Label(block_head, text="Rotunda blocks", font=("TkDefaultFont", 11, "bold")).pack(side="left")
        ttk.Button(block_head, text="ADD +", command=self.add_block).pack(side="right")
        self.block_list = tk.Listbox(left, exportselection=False)
        self.block_list.pack(fill="both", expand=True, pady=(8, 0))
        self.block_list.bind("<<ListboxSelect>>", self._on_select_block)

        notebook = ttk.Notebook(right)
        notebook.pack(fill="both", expand=True)
        block_tab = ttk.Frame(notebook, padding=12)
        global_tab = ttk.Frame(notebook, padding=12)
        pages_tab = ttk.Frame(notebook, padding=12)
        notebook.add(block_tab, text="Selected block")
        notebook.add(global_tab, text="Global text & links")
        notebook.add(pages_tab, text="Pages")

        block_canvas, block_inner = self._scrolling_frame(block_tab)
        block_canvas.pack(fill="both", expand=True)
        for field, label, multiline, values in BLOCK_FIELDS:
            ttk.Label(block_inner, text=label).pack(anchor="w", pady=(10, 4))
            if multiline:
                widget: tk.Text | ttk.Entry | ttk.Combobox = tk.Text(block_inner, height=5, wrap="word", undo=True)
            elif values:
                widget = ttk.Combobox(block_inner, values=values)
            else:
                widget = ttk.Entry(block_inner)
            widget.pack(fill="x")
            self.block_entries[field] = widget
        ttk.Label(
            block_inner,
            text="ADD + creates a complete new CSV block. Image URL can later be filled by the bucket/media picker.",
            foreground="#666",
            wraplength=740,
        ).pack(anchor="w", pady=(18, 8))

        global_canvas, global_inner = self._scrolling_frame(global_tab)
        global_canvas.pack(fill="both", expand=True)
        for field, label in GLOBAL_FIELDS:
            ttk.Label(global_inner, text=label).pack(anchor="w", pady=(9, 3))
            entry = ttk.Entry(global_inner)
            entry.pack(fill="x")
            self.global_entries[field] = entry

        page_notebook = ttk.Notebook(pages_tab)
        page_notebook.pack(fill="both", expand=True)
        for page_key, page_label in (("acting", "ACTING"), ("design", "DESIGN"), ("resume", "RESUME"), ("contact", "CONTACT")):
            tab = ttk.Frame(page_notebook, padding=8)
            page_notebook.add(tab, text=page_label)
            canvas, inner = self._scrolling_frame(tab)
            canvas.pack(fill="both", expand=True)
            title_row = ttk.Frame(inner)
            title_row.pack(fill="x", pady=(2, 8))
            ttk.Label(title_row, text=f"{page_label} page", font=("TkDefaultFont", 11, "bold")).pack(side="left")
            if page_key in {"acting", "design", "contact"}:
                ttk.Button(title_row, text="ADD + SECTION", command=lambda p=page_key: self.add_page_section(p)).pack(side="right")

            for field_key, label, multiline, _default in PAGE_FIELDS[page_key]:
                ttk.Label(inner, text=label).pack(anchor="w", pady=(10, 4))
                if multiline:
                    widget = tk.Text(inner, height=5, wrap="word", undo=True)
                else:
                    widget = ttk.Entry(inner)
                widget.pack(fill="x")
                self.page_entries[(page_key, field_key)] = widget

            if page_key in {"acting", "design", "contact"}:
                ttk.Separator(inner).pack(fill="x", pady=18)
                ttk.Label(inner, text="Image / text sections", font=("TkDefaultFont", 10, "bold")).pack(anchor="w")
                host = ttk.Frame(inner)
                host.pack(fill="x", pady=(8, 0))
                self.section_hosts[page_key] = host

    def _scrolling_frame(self, parent: ttk.Frame) -> tuple[tk.Canvas, ttk.Frame]:
        canvas = tk.Canvas(parent, highlightthickness=0)
        scrollbar = ttk.Scrollbar(parent, orient="vertical", command=canvas.yview)
        inner = ttk.Frame(canvas)
        window = canvas.create_window((0, 0), window=inner, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        scrollbar.pack(side="right", fill="y")

        def resize_inner(_: tk.Event) -> None:
            canvas.configure(scrollregion=canvas.bbox("all"))

        def resize_canvas(event: tk.Event) -> None:
            canvas.itemconfigure(window, width=event.width)

        inner.bind("<Configure>", resize_inner)
        canvas.bind("<Configure>", resize_canvas)
        return canvas, inner

    # ---------- local config / token ----------

    def _load_config(self) -> dict[str, str]:
        try:
            data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {}

    def _save_config(self) -> None:
        CONFIG_PATH.write_text(json.dumps({"token_location": self.token_location.get().strip() or "NULL"}, indent=2), encoding="utf-8")

    def choose_token_location(self) -> None:
        filename = filedialog.askopenfilename(title="Choose local text file containing GitHub token", filetypes=[("Text files", "*.txt"), ("All files", "*.*")])
        if filename:
            self.token_location.set(filename)
            self.save_token_location()

    def save_token_location(self) -> None:
        self.token_location.set(self.token_location.get().strip() or "NULL")
        try:
            self._save_config()
            self.status_text.set("Token location saved")
        except OSError as exc:
            messagebox.showerror("Could not save settings", str(exc))

    def _read_token(self, required: bool = True) -> str | None:
        location = self.token_location.get().strip()
        if not location or location.upper() == "NULL":
            if required:
                raise GithubFailure("TOKEN LOCATION is NULL. Choose the local token file first.")
            return None
        path = Path(location).expanduser()
        if not path.is_file():
            if required:
                raise GithubFailure(f"Token file was not found at:\n{path}")
            return None
        token = path.read_text(encoding="utf-8").strip()
        if not token:
            raise GithubFailure("The token file is empty.")
        lowered = token.lower()
        if lowered.startswith("bearer "):
            token = token[7:].strip()
        elif lowered.startswith("token "):
            token = token[6:].strip()
        return token

    # ---------- GitHub ----------

    def _contents_url(self, remote_path: str, ref: str | None = None) -> str:
        encoded = "/".join(urllib.parse.quote(part, safe="") for part in remote_path.split("/"))
        url = f"https://api.github.com/repos/{REPOSITORY}/contents/{encoded}"
        if ref:
            url += "?" + urllib.parse.urlencode({"ref": ref})
        return url

    def _github_json(self, method: str, url: str, payload: dict | None = None, token_required: bool = False) -> dict:
        token = self._read_token(required=token_required)
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "Quandranea-Portfolio-Builder",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                raw = response.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            try:
                detail = json.loads(exc.read().decode("utf-8")).get("message", str(exc))
            except Exception:
                detail = str(exc)
            raise GithubFailure(f"GitHub returned {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise GithubFailure(f"Could not reach GitHub: {exc.reason}") from exc

    def _fetch_remote_text(self, remote_path: str) -> tuple[str, str]:
        data = self._github_json("GET", self._contents_url(remote_path, BRANCH), token_required=False)
        content, sha = data.get("content"), data.get("sha")
        if not isinstance(content, str) or not isinstance(sha, str):
            raise GithubFailure(f"GitHub did not return readable {remote_path}.")
        return base64.b64decode(content.replace("\n", "")).decode("utf-8"), sha

    def _publish_text(self, text: str, message: str) -> str:
        self._read_token(required=True)
        _, sha = self._fetch_remote_text(REMOTE_TRUTH)
        payload = {
            "message": message,
            "content": base64.b64encode(text.encode("utf-8")).decode("ascii"),
            "sha": sha,
            "branch": BRANCH,
        }
        result = self._github_json("PUT", self._contents_url(REMOTE_TRUTH), payload=payload, token_required=True)
        return str(result.get("commit", {}).get("sha", ""))

    # ---------- CSV ----------

    def open_file(self) -> None:
        filename = filedialog.askopenfilename(title="Open truth.csv", filetypes=[("CSV files", "*.csv"), ("All files", "*.*")])
        if not filename:
            return
        selected = Path(filename)
        if selected.name.lower() == REMOTE_STANDARD:
            truth_path = selected.parent / REMOTE_TRUTH
            shutil.copyfile(selected, truth_path)
            selected = truth_path
        self.load_file(selected)

    def _new_csv_row(self) -> dict[str, str]:
        return {field: "" for field in self.fieldnames}

    def _ensure_page_rows(self) -> None:
        needed = {"record_type", "product_id", "title", "description"}
        if not needed.issubset(self.fieldnames):
            raise ValueError("truth.csv is missing required page-content columns")
        existing: dict[tuple[str, str], int] = {}
        for index, row in enumerate(self.rows):
            if row.get("record_type") != "page_text":
                continue
            key = ((row.get("product_id") or "").strip().lower(), (row.get("title") or "").strip())
            if all(key):
                existing[key] = index
        for page_key, definitions in PAGE_FIELDS.items():
            for field_key, _label, _multiline, default in definitions:
                key = (page_key, field_key)
                if key in existing:
                    continue
                row = self._new_csv_row()
                row.update(record_type="page_text", product_id=page_key, title=field_key, description=default)
                self.rows.append(row)
                existing[key] = len(self.rows) - 1
        self.page_row_indices = existing

    def load_file(self, path: Path) -> None:
        try:
            with path.open("r", encoding="utf-8-sig", newline="") as handle:
                reader = csv.DictReader(handle)
                if not reader.fieldnames:
                    raise ValueError("CSV has no header row")
                self.fieldnames = list(reader.fieldnames)
                self.rows = [dict(row) for row in reader]
            self._ensure_page_rows()
        except Exception as exc:
            messagebox.showerror("Could not open CSV", str(exc))
            return

        self.path = path
        self._refresh_block_indices()
        if not self.block_indices:
            messagebox.showerror("Invalid truth.csv", "No block rows were found.")
            return
        self.path_label.configure(text=str(path))
        self._load_global_fields()
        self._load_page_fields()
        self._rebuild_section_editors()
        self._refresh_block_list(select_position=0)
        self.status_text.set(f"Loaded {path.name}")

    def _refresh_block_indices(self) -> None:
        self.block_indices = [i for i, row in enumerate(self.rows) if (row.get("record_type") or "block") == "block"]
        self.block_indices.sort(key=lambda i: int(self.rows[i].get("order") or 0))

    def _refresh_block_list(self, select_position: int | None = None) -> None:
        self.block_list.delete(0, "end")
        for position, row_index in enumerate(self.block_indices, start=1):
            row = self.rows[row_index]
            title = row.get("title") or row.get("product_id") or f"Block {position}"
            self.block_list.insert("end", f"{position:02d}  {title}")
        if self.block_indices:
            position = max(0, min(select_position if select_position is not None else (self.current_block_position or 0), len(self.block_indices) - 1))
            self.current_block_position = None
            self.block_list.selection_set(position)
            self.block_list.activate(position)
            self._load_block(position)

    def _load_global_fields(self) -> None:
        first = self.rows[self.block_indices[0]]
        for field, entry in self.global_entries.items():
            widget_set(entry, first.get(field, "") or "")

    def _commit_global_fields(self) -> None:
        if not self.block_indices:
            return
        first = self.rows[self.block_indices[0]]
        for field, entry in self.global_entries.items():
            if field in self.fieldnames:
                first[field] = entry.get()

    def _load_page_fields(self) -> None:
        for key, widget in self.page_entries.items():
            index = self.page_row_indices.get(key)
            widget_set(widget, self.rows[index].get("description", "") if index is not None else "")

    def _commit_page_fields(self) -> None:
        for key, widget in self.page_entries.items():
            index = self.page_row_indices.get(key)
            if index is not None:
                self.rows[index]["description"] = widget_get(widget)

    def _on_select_block(self, _: tk.Event) -> None:
        selection = self.block_list.curselection()
        if not selection:
            return
        new_position = int(selection[0])
        if self.current_block_position is not None and new_position != self.current_block_position:
            self._commit_block()
        self._load_block(new_position)

    def _load_block(self, position: int) -> None:
        if position < 0 or position >= len(self.block_indices):
            return
        self.current_block_position = position
        row = self.rows[self.block_indices[position]]
        for field, widget in self.block_entries.items():
            widget_set(widget, row.get(field, "") or "")

    def _commit_block(self) -> None:
        if self.current_block_position is None or self.current_block_position >= len(self.block_indices):
            return
        row = self.rows[self.block_indices[self.current_block_position]]
        for field, widget in self.block_entries.items():
            if field in self.fieldnames:
                row[field] = widget_get(widget)

    def add_block(self) -> None:
        if not self.fieldnames or not self.block_indices:
            messagebox.showerror("No CSV", "Open truth.csv first.")
            return
        self._commit_all()
        existing_ids = {self.rows[i].get("product_id", "") for i in self.block_indices}
        numbers = []
        for value in existing_ids:
            match = re.search(r"product_nume_objects_(\d+)$", value or "")
            if match:
                numbers.append(int(match.group(1)))
        number = max(numbers, default=len(self.block_indices)) + 1
        product_id = f"product_nume_objects_{number:02d}"
        while product_id in existing_ids:
            number += 1
            product_id = f"product_nume_objects_{number:02d}"
        order = max((int(self.rows[i].get("order") or 0) for i in self.block_indices), default=0) + 1
        first = self.rows[self.block_indices[0]]
        row = self._new_csv_row()
        row.update({
            "record_type": "block",
            "product_id": product_id,
            "order": str(order),
            "title": "New Project",
            "description": "Describe this project.",
            "price_minor": "0",
            "currency": "usd",
            "availability": "available",
            "image_url": first.get("image_url") or "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=1200&q=85",
            "image_alt": "Portfolio image for New Project",
            "destination_label": first.get("visit_label") or "Visit project",
            "destination_url": "",
        })
        self.rows.append(row)
        self._refresh_block_indices()
        new_position = next(i for i, row_index in enumerate(self.block_indices) if self.rows[row_index].get("product_id") == product_id)
        self._refresh_block_list(select_position=new_position)
        self.status_text.set(f"Added block {order}; save or publish when ready")

    # ---------- page sections ----------

    def _section_rows(self, page_key: str) -> list[int]:
        matches = [i for i, row in enumerate(self.rows) if row.get("record_type") == "page_section" and (row.get("product_id") or "").strip().lower() == page_key]
        return sorted(matches, key=lambda i: int(self.rows[i].get("order") or 0))

    def add_page_section(self, page_key: str) -> None:
        if not self.fieldnames:
            messagebox.showerror("No CSV", "Open truth.csv first.")
            return
        self._commit_all()
        existing = self._section_rows(page_key)
        order = max((int(self.rows[i].get("order") or 0) for i in existing), default=0) + 1
        row = self._new_csv_row()
        row.update({
            "record_type": "page_section",
            "product_id": page_key,
            "order": str(order),
            "availability": "left" if order % 2 else "right",
            "title": "New section",
            "destination_label": "Subheader",
            "description": "Add body text here.",
            "image_url": "",
            "image_alt": "Page section image",
            "font_scope": "h2",
            "font_product_id": "h3",
            "color_scope": "p",
            "text_color": "#f1eee7",
            "color_product_id": "#b4b2ad",
            "footer_icon_ref": "#b4b2ad",
            "destination_url": "",
            "footer_icon_label": "",
            "footer_icon_url": "",
        })
        self.rows.append(row)
        self._rebuild_section_editors()
        self.status_text.set(f"Added {page_key.upper()} section {order}")

    def _rebuild_section_editors(self) -> None:
        for host in self.section_hosts.values():
            for child in host.winfo_children():
                child.destroy()
        self.section_widgets = {}
        for page_key, host in self.section_hosts.items():
            rows = self._section_rows(page_key)
            if not rows:
                ttk.Label(host, text="No image/text sections yet. Use ADD + SECTION.", foreground="#777").pack(anchor="w", pady=8)
                continue
            for row_index in rows:
                self._build_section_card(host, row_index)

    def _build_section_card(self, parent: ttk.Frame, row_index: int) -> None:
        row = self.rows[row_index]
        card = ttk.LabelFrame(parent, text=f"Section {row.get('order') or '?'}", padding=12)
        card.pack(fill="x", pady=(0, 14))
        card.columnconfigure(1, weight=1)
        widgets: dict[str, tk.Text | ttk.Entry | ttk.Combobox] = {}

        def add_entry(key: str, label: str, line: int, values: list[str] | None = None) -> None:
            ttk.Label(card, text=label).grid(row=line, column=0, sticky="nw", padx=(0, 10), pady=4)
            widget: ttk.Entry | ttk.Combobox
            if values:
                widget = ttk.Combobox(card, values=values)
            else:
                widget = ttk.Entry(card)
            widget.grid(row=line, column=1, sticky="ew", pady=4)
            widgets[key] = widget

        add_entry("order", "Order", 0)
        add_entry("image_side", "Image side", 1, ["left", "right"])
        add_entry("image_url", "Image URL", 2)
        add_entry("image_alt", "Image alt", 3)

        line = 4
        for prefix, label, multiline in (("header", "Header", False), ("subheader", "Subheader", False), ("body", "Body", True)):
            ttk.Separator(card).grid(row=line, column=0, columnspan=3, sticky="ew", pady=(10, 8))
            line += 1
            ttk.Label(card, text=label, font=("TkDefaultFont", 9, "bold")).grid(row=line, column=0, sticky="nw", pady=4)
            if multiline:
                text_widget: tk.Text | ttk.Entry = tk.Text(card, height=5, wrap="word", undo=True)
            else:
                text_widget = ttk.Entry(card)
            text_widget.grid(row=line, column=1, sticky="ew", pady=4)
            widgets[prefix] = text_widget
            line += 1

            add_entry(f"{prefix}_tag", "Element", line, TEXT_TAGS)
            line += 1

            ttk.Label(card, text="Color").grid(row=line, column=0, sticky="w", pady=4)
            color_entry = ttk.Entry(card)
            color_entry.grid(row=line, column=1, sticky="ew", pady=4)
            ttk.Button(card, text="Pick…", command=lambda e=color_entry: self._pick_color(e)).grid(row=line, column=2, padx=(8, 0), pady=4)
            widgets[f"{prefix}_color"] = color_entry
            line += 1

            add_entry(f"{prefix}_font_url", "Google Font URL", line)
            line += 1

        for logical, column in SECTION_COLUMNS.items():
            if logical in widgets:
                widget_set(widgets[logical], row.get(column, "") or "")
        self.section_widgets[row_index] = widgets

    def _pick_color(self, entry: ttk.Entry) -> None:
        _rgb, hex_value = colorchooser.askcolor(color=entry.get() or None, parent=self)
        if hex_value:
            widget_set(entry, hex_value)

    def _commit_sections(self) -> None:
        for row_index, widgets in self.section_widgets.items():
            if row_index >= len(self.rows):
                continue
            row = self.rows[row_index]
            for logical, widget in widgets.items():
                column = SECTION_COLUMNS.get(logical)
                if column in self.fieldnames:
                    row[column] = widget_get(widget)

    def _commit_all(self) -> None:
        self._commit_block()
        self._commit_global_fields()
        self._commit_page_fields()
        self._commit_sections()

    def _csv_text(self) -> str:
        self._commit_all()
        if not self.fieldnames or not self.rows:
            raise ValueError("No CSV is loaded.")
        buffer = StringIO(newline="")
        writer = csv.DictWriter(buffer, fieldnames=self.fieldnames, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        writer.writerows(self.rows)
        return buffer.getvalue()

    def _write_text(self, destination: Path, text: str) -> bool:
        try:
            with destination.open("w", encoding="utf-8", newline="") as handle:
                handle.write(text)
        except OSError as exc:
            messagebox.showerror("Could not save CSV", str(exc))
            return False
        return True

    def _truth_path(self) -> Path:
        return self.path.parent / REMOTE_TRUTH if self.path else Path.cwd() / REMOTE_TRUTH

    def save_file(self) -> None:
        try:
            text = self._csv_text()
        except ValueError as exc:
            messagebox.showerror("Nothing to save", str(exc))
            return
        destination = self._truth_path()
        if self._write_text(destination, text):
            self.path = destination
            self.path_label.configure(text=str(destination))
            self.status_text.set("Saved local truth.csv")
            messagebox.showinfo("Saved", f"Local truth.csv updated:\n{destination}")

    def save_as(self) -> None:
        filename = filedialog.asksaveasfilename(title="Save CSV copy", initialfile="truth.csv", defaultextension=".csv", filetypes=[("CSV files", "*.csv")])
        if not filename:
            return
        try:
            text = self._csv_text()
        except ValueError as exc:
            messagebox.showerror("Nothing to save", str(exc))
            return
        if self._write_text(Path(filename), text):
            messagebox.showinfo("Saved", f"CSV copy saved to:\n{filename}")

    # ---------- CMS actions ----------

    def load_latest_from_github(self) -> None:
        self.status_text.set("Loading latest truth.csv…")
        self.update_idletasks()
        try:
            text, _ = self._fetch_remote_text(REMOTE_TRUTH)
            destination = self._truth_path()
            if self._write_text(destination, text):
                self.load_file(destination)
                self.status_text.set("Loaded latest from GitHub")
        except GithubFailure as exc:
            self.status_text.set("Load failed")
            messagebox.showerror("Could not load from GitHub", str(exc))

    def publish_to_github(self) -> None:
        self.status_text.set("Saving and publishing…")
        self.update_idletasks()
        try:
            text = self._csv_text()
            destination = self._truth_path()
            if not self._write_text(destination, text):
                return
            self.path = destination
            self.path_label.configure(text=str(destination))
            commit = self._publish_text(text, "Update portfolio content from desktop builder")
            self.status_text.set("Published. GitHub Actions will redeploy.")
            messagebox.showinfo("Published", f"truth.csv was updated on GitHub.\n\nCommit: {commit[:12] if commit else 'created'}\nGitHub Actions will rebuild the portfolio automatically.")
        except (GithubFailure, ValueError, OSError) as exc:
            self.status_text.set("Publish failed")
            messagebox.showerror("Could not publish", str(exc))

    def _standard_text(self) -> str:
        local_standard = self._truth_path().parent / REMOTE_STANDARD
        if local_standard.is_file():
            return local_standard.read_text(encoding="utf-8-sig")
        text, _ = self._fetch_remote_text(REMOTE_STANDARD)
        try:
            local_standard.write_text(text, encoding="utf-8")
        except OSError:
            pass
        return text

    def revert_to_standard_and_publish(self) -> None:
        if not messagebox.askyesno("Revert portfolio?", "This replaces ALL current truth.csv edits, added blocks, and page sections with standard.csv, then publishes the reset.\n\nContinue?"):
            return
        self.status_text.set("Restoring standard.csv…")
        self.update_idletasks()
        try:
            standard_text = self._standard_text()
            destination = self._truth_path()
            if not self._write_text(destination, standard_text):
                return
            self.load_file(destination)
            reset_text = self._csv_text()
            if not self._write_text(destination, reset_text):
                return
            commit = self._publish_text(reset_text, "Revert portfolio content to standard.csv")
            self.status_text.set("Standard restored and published")
            messagebox.showinfo("Reverted", f"truth.csv now matches the standard portfolio baseline.\n\nCommit: {commit[:12] if commit else 'created'}\nGitHub Actions will redeploy automatically.")
        except (GithubFailure, OSError, ValueError) as exc:
            self.status_text.set("Revert failed")
            messagebox.showerror("Could not revert", str(exc))


def main() -> None:
    initial = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else None
    PortfolioBuilder(initial).mainloop()


if __name__ == "__main__":
    main()
