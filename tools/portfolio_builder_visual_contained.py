#!/usr/bin/env python3
"""Contained-image visual UX for the Quandranea portfolio builder.

Keeps each embedded R2 preview inside a compact fixed-height viewport and
always scales the entire image proportionally to fit. Portrait images receive
side margins; landscape images receive top/bottom margins. Nothing is cropped
or stretched.
"""

from __future__ import annotations

import sys
import tkinter as tk
from pathlib import Path

import portfolio_builder_visual as visual_module
import portfolio_builder_visual_final as final_module


class ContainedEmbeddedMediaViewer(visual_module.EmbeddedMediaViewer):
    """Embedded viewer whose image stage is a compact fixed pixel box."""

    def __init__(
        self,
        owner,
        parent,
        label,
        location_getter,
        current_url_getter,
        select_callback,
        max_size,
    ) -> None:
        super().__init__(
            owner,
            parent,
            label,
            location_getter,
            current_url_getter,
            select_callback,
            max_size,
        )

        # The original Label used a text-line height, which can collapse around
        # a PhotoImage on Windows and show only a thin slice. Replace it with a
        # true pixel-sized viewport. The inherited rendering code already uses
        # Pillow.thumbnail()/PhotoImage.subsample(), so the whole image is
        # proportionally reduced to max_size before being centered here.
        self.stage.destroy()
        self.stage_box = tk.Frame(
            self.frame,
            width=max_size[0],
            height=max_size[1],
            bg="#111111",
            highlightthickness=1,
            highlightbackground="#2c2c2c",
        )
        self.stage_box.pack(fill="x", before=self.filename)
        self.stage_box.pack_propagate(False)

        self.stage = tk.Label(
            self.stage_box,
            text="R2 image viewer",
            bg="#111111",
            fg="#d8d4cd",
            compound="center",
            justify="center",
            anchor="center",
        )
        self.stage.pack(fill="both", expand=True)


# Both layers construct EmbeddedMediaViewer by looking up their module-level
# symbol at runtime. Point them to the contained version before the GUI exists.
visual_module.EmbeddedMediaViewer = ContainedEmbeddedMediaViewer
final_module.EmbeddedMediaViewer = ContainedEmbeddedMediaViewer


class ContainedVisualPortfolioBuilder(final_module.FinalVisualPortfolioBuilder):
    pass


def main() -> None:
    initial = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else None
    ContainedVisualPortfolioBuilder(initial).mainloop()


if __name__ == "__main__":
    main()
