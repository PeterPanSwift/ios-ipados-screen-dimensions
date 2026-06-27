#!/usr/bin/env python3
"""Fetch Apple's HIG and export iOS/iPadOS screen dimensions as JSON."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen


DEFAULT_PAGE_URL = (
    "https://developer.apple.com/design/human-interface-guidelines/"
    "layout#iOS-iPadOS-device-screen-dimensions"
)
DEFAULT_OUTPUT = "ios_ipados_screen_dimensions.json"
TARGET_ANCHOR = "iOS-iPadOS-device-screen-dimensions"
DIMENSIONS_RE = re.compile(
    r"^\s*(?P<point_width>\d+)\s*[x×]\s*(?P<point_height>\d+)\s*pt\s*"
    r"\(\s*(?P<pixel_width>\d+)\s*[x×]\s*(?P<pixel_height>\d+)\s*px\s*"
    r"@(?P<scale>\d+(?:\.\d+)?)x\s*\)\s*$",
    re.IGNORECASE,
)


class ParseError(RuntimeError):
    """Raised when Apple's document no longer has the expected structure."""


def docc_data_url(source_url: str) -> str:
    """Convert an Apple HIG page URL to its DocC JSON endpoint."""
    parsed = urlsplit(source_url)
    if parsed.path.endswith(".json"):
        return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, parsed.query, ""))

    page_path = parsed.path.rstrip("/")
    if not page_path:
        raise ValueError(f"Invalid Apple documentation URL: {source_url}")

    data_path = f"/tutorials/data{page_path}.json"
    return urlunsplit((parsed.scheme, parsed.netloc, data_path, "", ""))


def fetch_document(source_url: str, timeout: float = 30.0) -> dict[str, Any]:
    """Download and decode the page's DocC JSON document."""
    data_url = docc_data_url(source_url)
    request = Request(
        data_url,
        headers={
            "Accept": "application/json",
            "User-Agent": "screen-dimensions-parser/1.0 (+Python urllib)",
        },
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            payload = response.read()
    except HTTPError as error:
        raise RuntimeError(
            f"Apple DocC endpoint returned HTTP {error.code}: {data_url}"
        ) from error
    except URLError as error:
        raise RuntimeError(f"Unable to download {data_url}: {error.reason}") from error

    try:
        document = json.loads(payload)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Response is not valid JSON: {data_url}") from error

    if not isinstance(document, dict):
        raise RuntimeError(f"Unexpected JSON root at {data_url}")
    return document


def _find_first_table(node: Any) -> dict[str, Any] | None:
    if isinstance(node, dict):
        if node.get("type") == "table":
            return node
        for value in node.values():
            found = _find_first_table(value)
            if found is not None:
                return found
    elif isinstance(node, list):
        for value in node:
            found = _find_first_table(value)
            if found is not None:
                return found
    return None


def _find_table_after_anchor(node: Any, anchor: str) -> dict[str, Any] | None:
    """Find the first table following a heading with the requested anchor."""
    if isinstance(node, list):
        for index, item in enumerate(node):
            if isinstance(item, dict) and item.get("anchor") == anchor:
                heading_level = item.get("level", 99)
                for candidate in node[index + 1 :]:
                    if (
                        isinstance(candidate, dict)
                        and candidate.get("type") == "heading"
                        and candidate.get("level", 99) <= heading_level
                    ):
                        break
                    table = _find_first_table(candidate)
                    if table is not None:
                        return table
                return None

        for item in node:
            found = _find_table_after_anchor(item, anchor)
            if found is not None:
                return found
    elif isinstance(node, dict):
        for value in node.values():
            found = _find_table_after_anchor(value, anchor)
            if found is not None:
                return found
    return None


def _text_fragments(node: Any) -> Iterator[str]:
    if isinstance(node, dict):
        text = node.get("text")
        if isinstance(text, str):
            yield text
        else:
            for value in node.values():
                yield from _text_fragments(value)
    elif isinstance(node, list):
        for value in node:
            yield from _text_fragments(value)


def _cell_text(cell: Any) -> str:
    return " ".join(fragment.strip() for fragment in _text_fragments(cell)).strip()


def _platform_for_model(model: str) -> str:
    return "iPadOS" if model.casefold().startswith("ipad") else "iOS"


def parse_document(document: dict[str, Any]) -> list[dict[str, Any]]:
    """Extract normalized device records from Apple's DocC document."""
    table = _find_table_after_anchor(document.get("primaryContentSections"), TARGET_ANCHOR)
    if table is None:
        raise ParseError(f"Could not find a table after section #{TARGET_ANCHOR}")

    rows = table.get("rows")
    if not isinstance(rows, list) or not rows:
        raise ParseError("The screen-dimensions table has no rows")

    header = [_cell_text(cell) for cell in rows[0]]
    if len(header) < 2 or header[0] != "Model" or not header[1].startswith("Dimensions"):
        raise ParseError(f"Unexpected screen-dimensions table header: {header!r}")

    devices: list[dict[str, Any]] = []
    for row_number, row in enumerate(rows[1:], start=2):
        if not isinstance(row, list) or len(row) < 2:
            raise ParseError(f"Malformed table row {row_number}")

        model = _cell_text(row[0])
        raw_dimensions = _cell_text(row[1])
        match = DIMENSIONS_RE.fullmatch(raw_dimensions)
        if not model or match is None:
            raise ParseError(
                f"Unable to parse table row {row_number}: "
                f"model={model!r}, dimensions={raw_dimensions!r}"
            )

        values = match.groupdict()
        scale_number = float(values["scale"])
        scale: int | float = (
            int(scale_number) if scale_number.is_integer() else scale_number
        )
        devices.append(
            {
                "model": model,
                "platform": _platform_for_model(model),
                "portrait": {
                    "points": {
                        "width": int(values["point_width"]),
                        "height": int(values["point_height"]),
                    },
                    "pixels": {
                        "width": int(values["pixel_width"]),
                        "height": int(values["pixel_height"]),
                    },
                    "scale": scale,
                },
            }
        )

    if not devices:
        raise ParseError("The screen-dimensions table contains no devices")
    return devices


def build_output(source_url: str, devices: list[dict[str, Any]]) -> dict[str, Any]:
    counts = {
        platform: sum(device["platform"] == platform for device in devices)
        for platform in ("iOS", "iPadOS")
    }
    return {
        "source": source_url,
        "source_data": docc_data_url(source_url),
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "orientation": "portrait",
        "counts": {"total": len(devices), **counts},
        "devices": devices,
    }


def write_output(result: dict[str, Any], output: str, compact: bool) -> None:
    indent = None if compact else 2
    separators = (",", ":") if compact else None
    serialized = json.dumps(
        result, ensure_ascii=False, indent=indent, separators=separators
    ) + "\n"
    if output == "-":
        sys.stdout.write(serialized)
    else:
        Path(output).write_text(serialized, encoding="utf-8")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Parse Apple's iOS/iPadOS device screen dimensions into JSON."
    )
    parser.add_argument(
        "url",
        nargs="?",
        default=DEFAULT_PAGE_URL,
        help="Apple HIG page URL or DocC JSON URL",
    )
    parser.add_argument(
        "-o", "--output", default=DEFAULT_OUTPUT, help="Output path, or - for stdout"
    )
    parser.add_argument(
        "--timeout", type=float, default=30.0, help="HTTP timeout in seconds"
    )
    parser.add_argument("--compact", action="store_true", help="Write compact JSON")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        document = fetch_document(args.url, timeout=args.timeout)
        devices = parse_document(document)
        result = build_output(args.url, devices)
        write_output(result, args.output, args.compact)
    except (OSError, ValueError, RuntimeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    if args.output != "-":
        print(f"Wrote {len(devices)} devices to {args.output}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
