#!/usr/bin/env python3
"""
Genera apps/web/src/lib/world-map-paths.ts da un SVG mondiale (es. flekschas/simple-world-map).

Dipendenze: pip install svgelements pycountry

Uso:
  python scripts/generate-world-map-paths.py /percorso/world-map.svg

Trasforma il viewBox sorgente in 0 0 1000 500 (come il componente React).
"""

from __future__ import annotations

import argparse
import re
import sys
import pathlib
import xml.etree.ElementTree as ET

try:
    from svgelements import Matrix, Path as SvgPath
except ImportError:
    print("Installa: pip install svgelements", file=sys.stderr)
    sys.exit(1)

try:
    import pycountry
except ImportError:
    pycountry = None


def strip_ns(tag: str) -> str:
    return tag.split("}")[-1] if "}" in tag else tag


def iso_name(iso2: str) -> str:
    if iso2 == "XS":
        return "Somaliland"
    if pycountry:
        c = pycountry.countries.get(alpha_2=iso2)
        if c:
            return c.name
    return iso2


def parse_svg_countries(svg_path: str | pathlib.Path) -> dict[str, list[str]]:
    tree = ET.parse(str(svg_path))
    root = tree.getroot()
    world_g = None
    for child in root:
        if strip_ns(child.tag) == "g":
            world_g = child
            break
    if world_g is None:
        raise SystemExit("Nessun <g> trovato nel SVG")

    out: dict[str, list[str]] = {}
    for child in world_g:
        tag = strip_ns(child.tag)
        cid = child.get("id")
        if not cid or cid == "world-map":
            continue
        if tag == "path" and child.get("d"):
            out[cid] = [child.get("d", "")]
        elif tag == "g":
            ds: list[str] = []
            for node in child.iter():
                if node is child:
                    continue
                if strip_ns(node.tag) == "path" and node.get("d"):
                    ds.append(node.get("d", ""))
            if ds:
                out[cid] = ds
    return out


def transform_d(d: str, vx: float, vy: float, vw: float, vh: float) -> str:
    m = Matrix.translate(-vx, -vy) * Matrix.scale(1000 / vw, 500 / vh)
    p = SvgPath(d)
    p2 = p * m
    s = p2.d()
    return round_path_numbers(s)


def bbox_transformed(d: str, vx: float, vy: float, vw: float, vh: float) -> tuple[float, float, float, float]:
    m = Matrix.translate(-vx, -vy) * Matrix.scale(1000 / vw, 500 / vh)
    p2 = SvgPath(d) * m
    bb = p2.bbox()
    return (bb[0], bb[1], bb[2], bb[3])


def round_path_numbers(d: str) -> str:
    def repl(m: re.Match[str]) -> str:
        x = float(m.group(0))
        if abs(x - round(x)) < 1e-6:
            return str(int(round(x)))
        return f"{x:.3f}".rstrip("0").rstrip(".")

    return re.sub(r"[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?", repl, d)


def normalize_id(raw_id: str) -> tuple[str, str]:
    """Ritorna (iso2_upper, display_name)."""
    rid = raw_id.strip()
    if rid == "_somaliland":
        return "XS", "Somaliland"
    if len(rid) == 2 and rid.isalpha():
        u = rid.upper()
        return u, iso_name(u)
    return rid.upper()[:2] if len(rid) >= 2 else rid, rid.replace("_", " ").title()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("svg_file", help="Percorso al file SVG sorgente")
    ap.add_argument(
        "-o",
        "--out",
        default="apps/web/src/lib/world-map-paths.ts",
        help="File TypeScript di output",
    )
    args = ap.parse_args()
    svg_path = pathlib.Path(args.svg_file).resolve()
    out_path = pathlib.Path(args.out).resolve()

    tree = ET.parse(str(svg_path))
    root = tree.getroot()
    vb = root.get("viewBox")
    if not vb:
        raise SystemExit("viewBox mancante")
    parts = [float(x) for x in vb.split()]
    vx, vy, vw, vh = parts[0], parts[1], parts[2], parts[3]

    raw = parse_svg_countries(str(svg_path))
    items: list[tuple[str, str, str, float, float]] = []
    for raw_id, d_list in sorted(raw.items(), key=lambda x: x[0].lower()):
        iso2, name = normalize_id(raw_id)
        combined: list[str] = []
        min_x = min_y = float("inf")
        max_x = max_y = float("-inf")
        for d in d_list:
            if not d or not d.strip():
                continue
            combined.append(transform_d(d, vx, vy, vw, vh))
            bx0, by0, bx1, by1 = bbox_transformed(d, vx, vy, vw, vh)
            min_x = min(min_x, bx0)
            min_y = min(min_y, by0)
            max_x = max(max_x, bx1)
            max_y = max(max_y, by1)
        if not combined:
            continue
        d_out = "".join(combined) if len(combined) == 1 else " ".join(combined)
        cx = (min_x + max_x) / 2
        cy = (min_y + max_y) / 2
        items.append((iso2, name, d_out, cx, cy))

    items.sort(key=lambda x: x[0])

    lines = [
        "/**",
        " * Geometrie paesi per mappa SVG (viewBox 0 0 1000 500).",
        " * Generato da scripts/generate-world-map-paths.py — non editare a mano.",
        " * Fonte SVG: Simple World Map (CC BY-SA 3.0), coordinate proiettate in 1000×500.",
        " * cx/cy: centro bounding box (pallini segnali).",
        " */",
        "",
        "export type CountryPath = { iso2: string; name: string; d: string; cx: number; cy: number };",
        "",
        "export const COUNTRY_PATHS: CountryPath[] = [",
    ]
    for iso2, name, d, cx, cy in items:
        esc = d.replace("\\", "\\\\").replace("'", "\\'")
        lines.append("  {")
        lines.append(f"    iso2: '{iso2}',")
        lines.append(f"    name: {repr(name)},")
        lines.append(f"    d: '{esc}',")
        lines.append(f"    cx: {round(cx, 2)},")
        lines.append(f"    cy: {round(cy, 2)},")
        lines.append("  },")
    lines.append("];")
    lines.append("")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Scritto {out_path} ({len(items)} paesi/territori)")


if __name__ == "__main__":
    main()
