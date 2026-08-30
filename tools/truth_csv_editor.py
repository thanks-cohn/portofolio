#!/usr/bin/env python3
"""Quandranea desktop portfolio editor.

A tiny local CMS for truth.csv using only Python's standard library.

The GitHub token is never stored in this script, truth.csv, standard.csv, or the
repository. The app stores only the LOCAL FILE PATH to a text file containing a
fine-grained GitHub Personal Access Token. The intended token scope is one repo
only, with Contents: Read and write.

Normal edits modify local truth.csv. "Publish to GitHub" replaces the repo's
truth.csv on main, which triggers the existing GitHub Pages workflow.
standard.csv is the factory/default snapshot and is never edited by this tool.
"""

from __future__ import annotations

import base64
import csv
import json
import shutil
import sys
import tkinter as tk
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

CONFIG_PATH = Path.home() / ".quandranea_truth_editor.json"
REPOSITORY = "thanks-cohn/portofolio"
BRANCH = "main"
REMOTE_TRUTH = "truth.csv"
REMOTE_STANDARD = "standard.csv"

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


class GithubFailure(RuntimeError):
    pass


class TruthEditor(tk.Tk):
    def __init__(self, initial_path: Path | None = None) -> None:
        super().__init__()
        self.title("Quandranea portfolio editor")
        self.geometry("1180x830")
        self.minsize(940, 680)

        self.path: Path | None = None
        self.fieldnames: list[str] = []
        self.rows: list[dict[str, str]] = []
        self.block_indices: list[int] = []
        self.current_block_position: int | None = None
        self.entries: dict[str, tk.Text | ttk.Entry] = {}
        self.global_entries: dict[str, ttk.Entry] = {}

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
        github = ttk.LabelFrame(self, text="Website publishing", padding=(12, 10))
        github.pack(fill="x", padx=12, pady=(12, 6))
        github.columnconfigure(1, weight=1)

        ttk.Label(github, text="TOKEN LOCATION:").grid(row=0, column=0, sticky="w")
        ttk.Entry(github, textvariable=self.token_location).grid(
            row=0, column=1, sticky="ew", padx=(8, 8)
        )
        ttk.Button(github, text="Browse…", command=self.choose_token_location).grid(row=0, column=2)
        ttk.Button(github, text="Save Location", command=self.save_token_location).grid(
            row=0, column=3, padx=(8, 0)
        )

        ttk.Label(
            github,
            text=(
                "Use a fine-grained PAT restricted to this repository with Contents: Read and write. "
                "Only the token-file path is remembered locally."
            ),
            foreground="#666",
        ).grid(row=1, column=0, columnspan=4, sticky="w", pady=(5, 8))

        actions = ttk.Frame(github)
        actions.grid(row=2, column=0, columnspan=4, sticky="ew")
        ttk.Button(actions, text="Load Latest from GitHub", command=self.load_latest_from_github).pack(side="left")
        ttk.Button(actions, text="Publish to GitHub", command=self.publish_to_github).pack(side="left", padx=(8, 0))
        ttk.Button(
            actions,
            text="Revert to Standard & Publish",
            command=self.revert_to_standard_and_publish,
        ).pack(side="left", padx=(8, 0))
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
                widget: tk.Text | ttk.Entry = tk.Text(block_inner, height=5, wrap="word", undo=True)
            else:
                widget = ttk.Entry(block_inner)
            widget.pack(fill="x")
            self.entries[field] = widget

        ttk.Label(
            block_inner,
            text=(
                "Font/color rules and non-text catalog columns are preserved. "
                "Publish automatically saves these edits into local truth.csv first."
            ),
            wraplength=720,
            foreground="#666",
        ).pack(anchor="w", pady=(18, 8))

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

    # ---------- Local config / token ----------

    def _load_config(self) -> dict[str, str]:
        try:
            data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {}

    def _save_config(self) -> None:
        CONFIG_PATH.write_text(
            json.dumps({"token_location": self.token_location.get().strip() or "NULL"}, indent=2),
            encoding="utf-8",
        )

    def choose_token_location(self) -> None:
        filename = filedialog.askopenfilename(
            title="Choose the local text file containing the GitHub token",
            filetypes=[("Text files", "*.txt"), ("All files", "*.*")],
        )
        if filename:
            self.token_location.set(filename)
            self.save_token_location()

    def save_token_location(self) -> None:
        value = self.token_location.get().strip() or "NULL"
        self.token_location.set(value)
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
        try:
            token = path.read_text(encoding="utf-8").strip()
        except OSError as exc:
            raise GithubFailure(f"Could not read token file: {exc}") from exc
        if not token:
            raise GithubFailure("The token file is empty.")
        if token.lower().startswith("bearer "):
            token = token[7:].strip()
        elif token.lower().startswith("token "):
            token = token[6:].strip()
        return token

    # ---------- GitHub REST ----------

    def _contents_url(self, remote_path: str, ref: str | None = None) -> str:
        encoded = "/".join(urllib.parse.quote(part, safe="") for part in remote_path.split("/"))
        url = f"https://api.github.com/repos/{REPOSITORY}/contents/{encoded}"
        if ref:
            url += "?" + urllib.parse.urlencode({"ref": ref})
        return url

    def _github_json(
        self,
        method: str,
        url: str,
        payload: dict | None = None,
        token_required: bool = False,
    ) -> dict:
        token = self._read_token(required=token_required)
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "Quandranea-Truth-Editor",
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
        content = data.get("content")
        sha = data.get("sha")
        if not isinstance(content, str) or not isinstance(sha, str):
            raise GithubFailure(f"GitHub did not return a readable {remote_path}.")
        try:
            text = base64.b64decode(content.replace("\n", "")).decode("utf-8")
        except Exception as exc:
            raise GithubFailure(f"Could not decode {remote_path} from GitHub.") from exc
        return text, sha

    def _publish_text(self, text: str, message: str) -> str:
        self._read_token(required=True)
        _, sha = self._fetch_remote_text(REMOTE_TRUTH)
        payload = {
            "message": message,
            "content": base64.b64encode(text.encode("utf-8")).decode("ascii"),
            "sha": sha,
            "branch": BRANCH,
        }
        result = self._github_json(
            "PUT",
            self._contents_url(REMOTE_TRUTH),
            payload=payload,
            token_required=True,
        )
        return str(result.get("commit", {}).get("sha", ""))

    # ---------- CSV editing ----------

    def open_file(self) -> None:
        filename = filedialog.askopenfilename(
            title="Open truth.csv",
            filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
        )
        if not filename:
            return
        selected = Path(filename)
        if selected.name.lower() == REMOTE_STANDARD:
            truth_path = selected.parent / REMOTE_TRUTH
            shutil.copyfile(selected, truth_path)
            selected = truth_path
        self.load_file(selected)

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
        self.status_text.set(f"Loaded {path.name}")

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
        self.block_list.insert(
            self.current_block_position,
            f"{self.current_block_position + 1:02d}  {display}",
        )
        self.block_list.selection_set(self.current_block_position)

    def _commit_all(self) -> None:
        self._commit_block()
        self._commit_global_fields()

    def _csv_text(self) -> str:
        self._commit_all()
        if not self.fieldnames or not self.rows:
            raise ValueError("No CSV is loaded.")
        from io import StringIO

        buffer = StringIO(newline="")
        writer = csv.DictWriter(buffer, fieldnames=self.fieldnames, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        writer.writerows(self.rows)
        return buffer.getvalue()

    def _write_text(self, destination: Path, text: str) -> bool:
        try:
            destination.write_text(text, encoding="utf-8", newline="")
        except TypeError:
            # Python versions where Path.write_text has no newline parameter.
            try:
                with destination.open("w", encoding="utf-8", newline="") as handle:
                    handle.write(text)
            except OSError as exc:
                messagebox.showerror("Could not save CSV", str(exc))
                return False
        except OSError as exc:
            messagebox.showerror("Could not save CSV", str(exc))
            return False
        return True

    def _truth_path(self) -> Path:
        if self.path:
            return self.path.parent / REMOTE_TRUTH
        return Path.cwd() / REMOTE_TRUTH

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
        filename = filedialog.asksaveasfilename(
            title="Save CSV copy",
            initialfile="truth.csv",
            defaultextension=".csv",
            filetypes=[("CSV files", "*.csv")],
        )
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
            if not self._write_text(destination, text):
                return
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
            commit = self._publish_text(text, "Update portfolio content from desktop editor")
            self.status_text.set("Published. GitHub Actions will redeploy.")
            messagebox.showinfo(
                "Published",
                "truth.csv was updated on GitHub.\n\n"
                f"Commit: {commit[:12] if commit else 'created'}\n"
                "GitHub Actions will rebuild the portfolio automatically.",
            )
        except (GithubFailure, ValueError) as exc:
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
        confirmed = messagebox.askyesno(
            "Revert portfolio?",
            "This will replace ALL current truth.csv edits with standard.csv, "
            "save the reset locally, and publish the reset to GitHub.\n\nContinue?",
        )
        if not confirmed:
            return
        self.status_text.set("Restoring standard.csv…")
        self.update_idletasks()
        try:
            standard_text = self._standard_text()
            destination = self._truth_path()
            if not self._write_text(destination, standard_text):
                return
            self.load_file(destination)
            commit = self._publish_text(standard_text, "Revert portfolio content to standard.csv")
            self.status_text.set("Standard restored and published")
            messagebox.showinfo(
                "Reverted",
                "truth.csv now matches standard.csv locally and on GitHub.\n\n"
                f"Commit: {commit[:12] if commit else 'created'}\n"
                "GitHub Actions will redeploy the standard version automatically.",
            )
        except (GithubFailure, OSError) as exc:
            self.status_text.set("Revert failed")
            messagebox.showerror("Could not revert", str(exc))


def main() -> None:
    initial = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else None
    TruthEditor(initial).mainloop()


if __name__ == "__main__":
    main()
