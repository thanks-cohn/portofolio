#!/usr/bin/env python3
"""Small desktop editor for the portfolio's truth.csv.

Uses only Python's standard library (Tkinter + csv). It edits the human-facing
block/global copy and preserves every other row and column, including font_rule
and color_rule rows. Save or Save As produces a ready-to-upload truth.csv.
"""

from __future__ import annotations

import csv
import sys
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

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

BLOCK_FIELDS = [
    ("title", "Card / project title", False),
    ("description", "Project description", True),
    ("image_alt", "Image alt text", True),
    ("destination_label", "Link label", False),
    ("destination_url", "Redirect URL", False),
    ("footer_icon_ref", "Footer icon reference", False),
    ("footer_icon_label", "Footer icon label", False),
    ("footer_icon_url", "Footer icon URL", False),
]


class TruthEditor(tk.Tk):
    def __init__(self, initial_path: Path | None = None) -> None:
        super().__init__()
        self.title("Quandranea truth.csv editor")
        self.geometry("1120x760")
        self.minsize(900, 620)

        self.path: Path | None = None
        self.fieldnames: list[str] = []
        self.rows: list[dict[str, str]] = []
        self.block_indices: list[int] = []
        self.current_block_position: int | None = None
        self.entries: dict[str, tk.Text | ttk.Entry] = {}
        self.global_entries: dict[str, ttk.Entry] = {}

        self._build_ui()

        candidate = initial_path or (Path.cwd() / "truth.csv")
        if candidate.exists():
            self.load_file(candidate)
        else:
            self.after(100, self.open_file)

    def _build_ui(self) -> None:
        toolbar = ttk.Frame(self, padding=(12, 10))
        toolbar.pack(fill="x")
        ttk.Button(toolbar, text="Open CSV", command=self.open_file).pack(side="left")
        ttk.Button(toolbar, text="Save", command=self.save_file).pack(side="left", padx=(8, 0))
        ttk.Button(toolbar, text="Save As…", command=self.save_as).pack(side="left", padx=(8, 0))
        self.path_label = ttk.Label(toolbar, text="No file loaded")
        self.path_label.pack(side="left", padx=18)

        body = ttk.Panedwindow(self, orient="horizontal")
        body.pack(fill="both", expand=True, padx=12, pady=(0, 12))

        left = ttk.Frame(body, padding=10)
        right = ttk.Frame(body, padding=10)
        body.add(left, weight=1)
        body.add(right, weight=4)

        ttk.Label(left, text="Visible blocks", font=("TkDefaultFont", 11, "bold")).pack(anchor="w")
        self.block_list = tk.Listbox(left, exportselection=False)
        self.block_list.pack(fill="both", expand=True, pady=(8, 0))
        self.block_list.bind("<<ListboxSelect>>", self._on_select_block)

        notebook = ttk.Notebook(right)
        notebook.pack(fill="both", expand=True)

        block_tab = ttk.Frame(notebook, padding=12)
        global_tab = ttk.Frame(notebook, padding=12)
        notebook.add(block_tab, text="Selected block")
        notebook.add(global_tab, text="Global text & links")

        block_canvas, block_inner = self._scrolling_frame(block_tab)
        block_canvas.pack(fill="both", expand=True)
        for field, label, multiline in BLOCK_FIELDS:
            ttk.Label(block_inner, text=label).pack(anchor="w", pady=(10, 4))
            if multiline:
                widget = tk.Text(block_inner, height=5, wrap="word", undo=True)
            else:
                widget = ttk.Entry(block_inner)
            widget.pack(fill="x")
            self.entries[field] = widget

        hint = ttk.Label(
            block_inner,
            text=(
                "Font/color rules and all non-text catalog columns are preserved exactly. "
                "This utility only changes the human-facing copy and destinations shown above."
            ),
            wraplength=700,
            foreground="#666",
        )
        hint.pack(anchor="w", pady=(18, 8))

        global_canvas, global_inner = self._scrolling_frame(global_tab)
        global_canvas.pack(fill="both", expand=True)
        for field, label in GLOBAL_FIELDS:
            ttk.Label(global_inner, text=label).pack(anchor="w", pady=(9, 3))
            entry = ttk.Entry(global_inner)
            entry.pack(fill="x")
            self.global_entries[field] = entry

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

    def open_file(self) -> None:
        filename = filedialog.askopenfilename(
            title="Open truth.csv",
            filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
        )
        if filename:
            self.load_file(Path(filename))

    def load_file(self, path: Path) -> None:
        try:
            with path.open("r", encoding="utf-8-sig", newline="") as handle:
                reader = csv.DictReader(handle)
                if not reader.fieldnames:
                    raise ValueError("CSV has no header row")
                self.fieldnames = list(reader.fieldnames)
                self.rows = [dict(row) for row in reader]
        except Exception as exc:
            messagebox.showerror("Could not open CSV", str(exc))
            return

        self.block_indices = [
            i for i, row in enumerate(self.rows)
            if (row.get("record_type") or "block") == "block"
        ]
        if not self.block_indices:
            messagebox.showerror("Invalid truth.csv", "No block rows were found.")
            return

        self.path = path
        self.path_label.configure(text=str(path))
        self.current_block_position = None
        self.block_list.delete(0, "end")
        for position, row_index in enumerate(self.block_indices, start=1):
            row = self.rows[row_index]
            title = row.get("title") or row.get("product_id") or f"Block {position}"
            self.block_list.insert("end", f"{position:02d}  {title}")

        self._load_global_fields()
        self.block_list.selection_set(0)
        self.block_list.activate(0)
        self._load_block(0)

    def _load_global_fields(self) -> None:
        first = self.rows[self.block_indices[0]]
        for field, entry in self.global_entries.items():
            entry.delete(0, "end")
            entry.insert(0, first.get(field, ""))

    def _commit_global_fields(self) -> None:
        if not self.block_indices:
            return
        first = self.rows[self.block_indices[0]]
        for field, entry in self.global_entries.items():
            if field in self.fieldnames:
                first[field] = entry.get()

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
        for field, widget in self.entries.items():
            value = row.get(field, "")
            if isinstance(widget, tk.Text):
                widget.delete("1.0", "end")
                widget.insert("1.0", value)
            else:
                widget.delete(0, "end")
                widget.insert(0, value)

    def _commit_block(self) -> None:
        if self.current_block_position is None:
            return
        row = self.rows[self.block_indices[self.current_block_position]]
        for field, widget in self.entries.items():
            if field not in self.fieldnames:
                continue
            row[field] = widget.get("1.0", "end-1c") if isinstance(widget, tk.Text) else widget.get()
        display = row.get("title") or row.get("product_id") or "Untitled"
        self.block_list.delete(self.current_block_position)
        self.block_list.insert(self.current_block_position, f"{self.current_block_position + 1:02d}  {display}")
        self.block_list.selection_set(self.current_block_position)

    def _commit_all(self) -> None:
        self._commit_block()
        self._commit_global_fields()

    def save_file(self) -> None:
        if not self.path:
            self.save_as()
            return
        self._write(self.path)

    def save_as(self) -> None:
        initial = self.path.name if self.path else "truth.csv"
        filename = filedialog.asksaveasfilename(
            title="Save ready-to-upload CSV",
            initialfile=initial,
            defaultextension=".csv",
            filetypes=[("CSV files", "*.csv")],
        )
        if filename:
            destination = Path(filename)
            if self._write(destination):
                self.path = destination
                self.path_label.configure(text=str(destination))

    def _write(self, destination: Path) -> bool:
        self._commit_all()
        if not self.fieldnames or not self.rows:
            messagebox.showerror("Nothing to save", "Load a truth.csv first.")
            return False
        try:
            with destination.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=self.fieldnames, extrasaction="ignore")
                writer.writeheader()
                writer.writerows(self.rows)
        except Exception as exc:
            messagebox.showerror("Could not save CSV", str(exc))
            return False
        messagebox.showinfo("Saved", f"Ready-to-upload CSV saved to:\n{destination}")
        return True


def main() -> None:
    initial = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else None
    TruthEditor(initial).mainloop()


if __name__ == "__main__":
    main()
