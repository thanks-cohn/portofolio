#!/usr/bin/env python3
"""Floating-Q content mode for the Quandranea desktop editor.

The existing CMS/publishing machinery stays intact underneath. This wrapper
makes the everyday surface safer for a non-technical editor:

- starts in READ ONLY
- a draggable floating Q stays above every tab/page
- the Q fades after ten seconds but remains a hover target
- right-click Q: EDIT, READ ONLY, PUBLISH, GitHub Token File...
- EDIT unlocks only ordinary visible text and image URL fields
- PUBLISH uses the existing hard-coded repo/main/truth.csv publisher
"""

from __future__ import annotations

import sys
import tkinter as tk
from pathlib import Path
from tkinter import ttk

from portfolio_builder_site import SitePortfolioBuilder


class QPortfolioBuilder(SitePortfolioBuilder):
    Q_SIZE = 56
    Q_FADE_MS = 10_000

    BLOCK_CONTENT_FIELDS = {
        "title",
        "description",
        "image_url",
        "image_alt",
        "destination_label",
        "content_section",
        "content_location",
    }
    GLOBAL_TEXT_FIELDS = {
        "row_heading",
        "row_subheader",
        "brand_top",
        "brand_bottom",
        "nav_home_label",
        "nav_acting_label",
        "nav_design_label",
        "nav_resume_label",
        "nav_contact_label",
        "footer_left",
        "details_label",
        "visit_label",
        "preview_header",
        "preview_source_prefix",
        "preview_note",
    }
    SECTION_CONTENT_FIELDS = {"image_url", "image_alt", "header", "subheader", "body"}

    def __init__(self, initial_path: Path | None = None) -> None:
        self._content_mode = "readonly"
        self._q_fade_job: str | None = None
        self._q_drag_origin: tuple[int, int, int, int] | None = None
        self._q_x: int | None = None
        self._q_y: int | None = None
        self._q_canvas: tk.Canvas | None = None
        self._q_menu: tk.Menu | None = None
        super().__init__(initial_path)
        self.title("Quandranea Editor")
        self.after_idle(self._finish_q_startup)

    def _build_ui(self) -> None:
        super()._build_ui()
        self._simplify_shell()
        self._install_q()

    # ---------- simplified shell ----------

    def _simplify_shell(self) -> None:
        """Hide the old technical publishing/file bars; Q owns those actions."""
        for child in list(self.winfo_children()):
            if isinstance(child, ttk.LabelFrame) and str(child.cget("text")) == "Website publishing":
                child.pack_forget()
                continue
            if isinstance(child, ttk.Frame):
                button_texts = {
                    str(grandchild.cget("text"))
                    for grandchild in child.winfo_children()
                    if isinstance(grandchild, ttk.Button)
                }
                if "Open CSV" in button_texts and "Save truth.csv" in button_texts:
                    child.pack_forget()

    # ---------- floating Q ----------

    def _install_q(self) -> None:
        canvas = tk.Canvas(
            self,
            width=self.Q_SIZE,
            height=self.Q_SIZE,
            highlightthickness=0,
            bd=0,
            relief="flat",
            cursor="hand2",
        )
        self._q_canvas = canvas
        canvas.create_oval(3, 3, self.Q_SIZE - 3, self.Q_SIZE - 3, tags="bubble")
        canvas.create_text(
            self.Q_SIZE / 2,
            self.Q_SIZE / 2 - 1,
            text="Q",
            font=("Georgia", 22, "bold"),
            tags="letter",
        )

        menu = tk.Menu(self, tearoff=False)
        menu.add_command(label="EDIT", command=self._set_edit_mode)
        menu.add_command(label="READ ONLY", command=self._set_read_only_mode)
        menu.add_separator()
        menu.add_command(label="PUBLISH", command=self._publish_from_q)
        menu.add_separator()
        menu.add_command(label="GitHub Token File...", command=self._choose_token_from_q)
        self._q_menu = menu

        canvas.bind("<Enter>", self._q_hover)
        canvas.bind("<Leave>", self._q_leave)
        canvas.bind("<ButtonPress-1>", self._q_drag_start)
        canvas.bind("<B1-Motion>", self._q_drag_move)
        canvas.bind("<ButtonRelease-1>", self._q_drag_end)
        canvas.bind("<Button-3>", self._q_popup)
        canvas.bind("<Button-2>", self._q_popup)
        self.bind("<Configure>", self._keep_q_on_screen, add="+")

        self._paint_q(faded=False)

    def _finish_q_startup(self) -> None:
        self.update_idletasks()
        if self._q_x is None or self._q_y is None:
            self._q_x = max(12, self.winfo_width() - self.Q_SIZE - 26)
            self._q_y = max(12, self.winfo_height() - self.Q_SIZE - 34)
        self._place_q()
        self._set_read_only_mode()
        self._schedule_q_fade()

    def _place_q(self) -> None:
        if self._q_canvas is None:
            return
        width = max(self.winfo_width(), self.Q_SIZE + 20)
        height = max(self.winfo_height(), self.Q_SIZE + 20)
        x = max(4, min(self._q_x if self._q_x is not None else width - 80, width - self.Q_SIZE - 4))
        y = max(4, min(self._q_y if self._q_y is not None else height - 90, height - self.Q_SIZE - 4))
        self._q_x, self._q_y = x, y
        self._q_canvas.place(x=x, y=y, width=self.Q_SIZE, height=self.Q_SIZE)
        self._q_canvas.lift()

    def _keep_q_on_screen(self, _event: tk.Event | None = None) -> None:
        if self._q_canvas is not None and self._q_canvas.winfo_exists():
            self.after_idle(self._place_q)

    def _paint_q(self, *, faded: bool) -> None:
        if self._q_canvas is None:
            return
        if faded:
            # Tk has no per-widget alpha. Keep a very faint but full-size hover
            # target so the Q can always be recovered simply by moving onto it.
            self._q_canvas.configure(bg="#111111")
            self._q_canvas.itemconfigure("bubble", fill="#171717", outline="#292929", width=1)
            self._q_canvas.itemconfigure("letter", fill="#343434")
        else:
            self._q_canvas.configure(bg="#111111")
            self._q_canvas.itemconfigure("bubble", fill="#f1eee7", outline="#f1eee7", width=1)
            self._q_canvas.itemconfigure("letter", fill="#111111")

    def _schedule_q_fade(self) -> None:
        if self._q_fade_job:
            try:
                self.after_cancel(self._q_fade_job)
            except tk.TclError:
                pass
        self._q_fade_job = self.after(self.Q_FADE_MS, self._fade_q)

    def _reveal_q(self) -> None:
        self._paint_q(faded=False)
        self._schedule_q_fade()
        if self._q_canvas is not None:
            self._q_canvas.lift()

    def _fade_q(self) -> None:
        self._q_fade_job = None
        self._paint_q(faded=True)

    def _q_hover(self, _event: tk.Event | None = None) -> None:
        self._reveal_q()

    def _q_leave(self, _event: tk.Event | None = None) -> None:
        self._schedule_q_fade()

    def _q_drag_start(self, event: tk.Event) -> None:
        self._reveal_q()
        self._q_drag_origin = (
            event.x_root,
            event.y_root,
            self._q_x or 0,
            self._q_y or 0,
        )

    def _q_drag_move(self, event: tk.Event) -> None:
        if self._q_drag_origin is None:
            return
        start_root_x, start_root_y, start_x, start_y = self._q_drag_origin
        self._q_x = start_x + (event.x_root - start_root_x)
        self._q_y = start_y + (event.y_root - start_root_y)
        self._place_q()

    def _q_drag_end(self, _event: tk.Event | None = None) -> None:
        self._q_drag_origin = None
        self._schedule_q_fade()

    def _q_popup(self, event: tk.Event) -> str:
        self._reveal_q()
        if self._q_menu is not None:
            try:
                self._q_menu.tk_popup(event.x_root, event.y_root)
            finally:
                self._q_menu.grab_release()
        return "break"

    # ---------- edit/read-only mode ----------

    def _walk_widgets(self, widget: tk.Misc):
        for child in widget.winfo_children():
            if child is self._q_canvas:
                continue
            yield child
            yield from self._walk_widgets(child)

    @staticmethod
    def _disable_input(widget: tk.Widget) -> None:
        try:
            if isinstance(widget, tk.Text):
                widget.configure(state="disabled")
            elif isinstance(widget, ttk.Combobox):
                widget.configure(state="disabled")
            elif isinstance(widget, ttk.Entry):
                widget.configure(state="disabled")
            elif isinstance(widget, tk.Entry):
                widget.configure(state="disabled")
        except tk.TclError:
            pass

    @staticmethod
    def _enable_input(widget: tk.Widget) -> None:
        try:
            if isinstance(widget, tk.Text):
                widget.configure(state="normal")
            elif isinstance(widget, ttk.Entry):
                widget.configure(state="normal")
            elif isinstance(widget, tk.Entry):
                widget.configure(state="normal")
        except tk.TclError:
            pass

    def _all_input_widgets(self) -> list[tk.Widget]:
        return [
            widget
            for widget in self._walk_widgets(self)
            if isinstance(widget, (tk.Text, tk.Entry, ttk.Entry, ttk.Combobox))
        ]

    def _content_widgets(self) -> list[tk.Widget]:
        result: list[tk.Widget] = []

        for field in self.BLOCK_CONTENT_FIELDS:
            widget = self.block_entries.get(field)
            if widget is not None:
                result.append(widget)

        for field in self.GLOBAL_TEXT_FIELDS:
            widget = self.global_entries.get(field)
            if widget is not None:
                result.append(widget)

        result.extend(widget for widget in self.page_entries.values() if widget is not None)

        for widgets in self.section_widgets.values():
            for field in self.SECTION_CONTENT_FIELDS:
                widget = widgets.get(field)
                if widget is not None:
                    result.append(widget)

        # Custom page names are ordinary visible copy. Their URL/path stays locked.
        for widgets in getattr(self, "custom_page_meta_widgets", {}).values():
            widget = widgets.get("name")
            if widget is not None:
                result.append(widget)

        # Social URLs are content links rather than infrastructure. Locate their
        # entries by their StringVars so they remain editable in EDIT mode.
        social_vars = set(getattr(self, "social_vars", {}).values())
        for widget in self._all_input_widgets():
            if not isinstance(widget, (ttk.Entry, tk.Entry)):
                continue
            try:
                variable_name = str(widget.cget("textvariable"))
            except tk.TclError:
                continue
            if variable_name and any(variable_name == str(var) for var in social_vars):
                result.append(widget)

        seen: set[str] = set()
        unique: list[tk.Widget] = []
        for widget in result:
            key = str(widget)
            if key in seen:
                continue
            seen.add(key)
            unique.append(widget)
        return unique

    def _apply_content_mode(self) -> None:
        for widget in self._all_input_widgets():
            self._disable_input(widget)
        if self._content_mode == "edit":
            for widget in self._content_widgets():
                self._enable_input(widget)
        self.status_text.set("EDIT - text and image URLs unlocked" if self._content_mode == "edit" else "READ ONLY")

    def _set_edit_mode(self) -> None:
        self._content_mode = "edit"
        self._apply_content_mode()
        self._reveal_q()

    def _set_read_only_mode(self) -> None:
        # Commit currently typed values before locking the fields again.
        if self._content_mode == "edit":
            try:
                self._commit_all()
            except Exception:
                pass
        self._content_mode = "readonly"
        self._apply_content_mode()
        self._reveal_q()

    def load_file(self, path: Path) -> None:
        super().load_file(path)
        if self.fieldnames:
            self.after_idle(self._apply_content_mode)

    # ---------- Q actions ----------

    def _choose_token_from_q(self) -> None:
        self._reveal_q()
        self.choose_token_location()

    def _publish_from_q(self) -> None:
        self._reveal_q()
        # Publishing should capture whatever is currently typed, even before the
        # user explicitly switches back to READ ONLY.
        self.publish_to_github()
        self._schedule_q_fade()


def main() -> None:
    initial = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else None
    QPortfolioBuilder(initial).mainloop()


if __name__ == "__main__":
    main()
