#!/usr/bin/env python3
"""Single-file R2 credential UX for the Quandranea portfolio builder.

The editor remembers only the path to a local JSON text file (for example
cloudfare.txt). That file contains the R2 token, account id, public base URL,
and optionally a default bucket/location. Per-block and per-page-section
locations remain available as optional overrides.
"""

from __future__ import annotations

import json
import sys
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, ttk

from portfolio_builder import CONFIG_PATH, PortfolioBuilder, widget_get
from portfolio_builder_media import MediaPortfolioBuilder, R2Failure, R2_COLUMN


class CredentialMediaPortfolioBuilder(MediaPortfolioBuilder):
    """Media builder whose R2 setup is one local JSON credential file."""

    def _save_config(self) -> None:
        data = {
            "token_location": self.token_location.get().strip() or "NULL",
            "r2_credentials_location": self._credentials_location_value() or "NULL",
        }
        CONFIG_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def _credentials_location_value(self) -> str:
        variable = getattr(self, "r2_credentials_location", None)
        return variable.get().strip() if variable is not None else "NULL"

    def _build_ui(self) -> None:
        # Deliberately skip MediaPortfolioBuilder._build_ui so the user does not
        # see separate Account ID / public-domain fields. Everything R2-specific
        # comes from one local credential file instead.
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
            ttk.Entry(publishing, textvariable=self.r2_credentials_location).grid(
                row=4, column=1, sticky="ew", padx=8
            )
            ttk.Button(publishing, text="Browse…", command=self.choose_r2_credentials_location).grid(
                row=4, column=2
            )
            ttk.Button(publishing, text="Save R2", command=self.save_r2_settings).grid(
                row=4, column=3, padx=(8, 0)
            )
            ttk.Label(
                publishing,
                text=(
                    'Point this at cloudfare.txt. JSON fields: token, account_id, '
                    'public_base_url, and optional location.'
                ),
                foreground="#666",
            ).grid(row=5, column=0, columnspan=4, sticky="w", pady=(5, 0))

        block_inner = self.block_entries["image_url"].master
        ttk.Separator(block_inner).pack(fill="x", pady=(18, 10))
        ttk.Label(block_inner, text="R2 bucket/location (optional override)").pack(anchor="w", pady=(0, 4))
        block_r2 = ttk.Entry(block_inner)
        block_r2.pack(fill="x")
        self.block_entries[R2_COLUMN] = block_r2
        ttk.Button(block_inner, text="Browse Images", command=self.browse_selected_block_images).pack(
            anchor="w", pady=(8, 4)
        )
        ttk.Label(
            block_inner,
            text=(
                "Leave blank to use the optional location in cloudfare.txt, or enter "
                "bucket/folder here to override it for this block."
            ),
            foreground="#666",
            wraplength=760,
        ).pack(anchor="w")

        self._build_media_overlay()
        self.bind("<Left>", self._media_left_key, add="+")
        self.bind("<Right>", self._media_right_key, add="+")
        self.bind("<Escape>", self._media_escape_key, add="+")

    def choose_r2_credentials_location(self) -> None:
        filename = filedialog.askopenfilename(
            title="Choose Cloudflare R2 credential text file",
            filetypes=[("Text / JSON files", "*.txt *.json"), ("All files", "*.*")],
        )
        if filename:
            self.r2_credentials_location.set(filename)
            self.save_r2_settings()

    def save_r2_settings(self) -> None:
        self.r2_credentials_location.set(self.r2_credentials_location.get().strip() or "NULL")
        try:
            # Validate now so a typo is caught where it is entered rather than
            # only when Browse Images is pressed later.
            self._read_r2_credentials()
            self._save_config()
            self.status_text.set("R2 credential file saved")
        except (OSError, R2Failure) as exc:
            self.status_text.set(f"R2 settings error: {exc}")

    def _credentials_path(self) -> Path:
        location = self.r2_credentials_location.get().strip()
        if not location or location.upper() == "NULL":
            raise R2Failure("R2 CREDENTIAL FILE is NULL. Choose cloudfare.txt first.")
        path = Path(location).expanduser()
        if not path.is_file():
            raise R2Failure(f"R2 credential file was not found: {path}")
        return path

    def _read_r2_credentials(self) -> dict[str, str]:
        path = self._credentials_path()
        try:
            raw = json.loads(path.read_text(encoding="utf-8-sig"))
        except json.JSONDecodeError as exc:
            raise R2Failure(
                f"{path.name} must contain JSON with token, account_id, public_base_url, and optional location."
            ) from exc
        except OSError as exc:
            raise R2Failure(f"Could not read R2 credential file: {exc}") from exc

        if not isinstance(raw, dict):
            raise R2Failure("R2 credential file must contain one JSON object.")

        credentials = {
            "token": str(raw.get("token") or "").strip(),
            "account_id": str(raw.get("account_id") or "").strip(),
            "public_base_url": str(raw.get("public_base_url") or "").strip(),
            "location": str(raw.get("location") or "").strip(),
        }
        if not credentials["token"]:
            raise R2Failure("R2 credential file is missing \"token\".")
        if not credentials["account_id"]:
            raise R2Failure("R2 credential file is missing \"account_id\".")

        token = credentials["token"]
        if token.lower().startswith("bearer "):
            credentials["token"] = token[7:].strip()
        return credentials

    def _read_r2_token(self) -> str:
        return self._read_r2_credentials()["token"]

    def _r2_account(self) -> str:
        return self._read_r2_credentials()["account_id"]

    def _credential_default_location(self) -> str:
        return self._read_r2_credentials().get("location", "").strip()

    def _effective_r2_location(self, explicit: str) -> str:
        override = explicit.strip()
        if override:
            return override
        default = self._credential_default_location()
        if default:
            return default
        raise R2Failure(
            'No R2 location is set. Add "location": "bucket/folder" to cloudfare.txt '
            "or enter a bucket/location override for this block or page section."
        )

    def _r2_public_base_for_bucket(self, bucket: str) -> str:
        configured = self._read_r2_credentials().get("public_base_url", "").strip()
        if configured:
            return configured.replace("{bucket}", bucket).rstrip("/")

        # public_base_url is allowed to be blank. In that case try the bucket's
        # enabled r2.dev domain. A narrowly-scoped token may not have permission
        # to inspect this setting, so failure simply means selection needs a
        # public_base_url added to the credential file.
        try:
            url = f"{self._r2_api_base(bucket)}/domains/managed"
            payload = self._cf_request(url, expect_json=True)
        except R2Failure:
            return ""
        if isinstance(payload, dict) and payload.get("success"):
            result = payload.get("result") or {}
            domain = str(result.get("domain") or "").strip()
            if result.get("enabled") and domain:
                return f"https://{domain}".rstrip("/")
        return ""

    def browse_selected_block_images(self) -> None:
        if self.current_block_position is None:
            self.status_text.set("Select a rotunda block first")
            return
        self._commit_block()
        row_index = self.block_indices[self.current_block_position]
        explicit = self.rows[row_index].get(R2_COLUMN, "") or widget_get(self.block_entries[R2_COLUMN])
        try:
            location = self._effective_r2_location(explicit)
        except R2Failure as exc:
            self.status_text.set(str(exc))
            return
        self._begin_media_browser(("block", row_index), location)

    def browse_section_images(self, row_index: int) -> None:
        self._commit_sections()
        explicit = self.rows[row_index].get(R2_COLUMN, "") if row_index < len(self.rows) else ""
        try:
            location = self._effective_r2_location(explicit)
        except R2Failure as exc:
            self.status_text.set(str(exc))
            return
        self._begin_media_browser(("section", row_index), location)

    def _build_section_card(self, parent: ttk.Frame, row_index: int) -> None:
        super()._build_section_card(parent, row_index)
        entry = self.section_media_entries.get(row_index)
        if entry is None:
            return
        # The inherited card already provides the field and Browse button; make
        # its label explicit that blank means the credential-file default.
        card = entry.master
        for child in card.grid_slaves():
            if isinstance(child, ttk.Label) and child.cget("text") == "R2 bucket/location":
                child.configure(text="R2 bucket/location (optional override)")
                break


def main() -> None:
    initial = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else None
    CredentialMediaPortfolioBuilder(initial).mainloop()


if __name__ == "__main__":
    main()
