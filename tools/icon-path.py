#!/usr/bin/env python3
"""Print the SVG path of Material Icons glyphs, for hugo/data/icons.json.

Draws each named icon from tools/sources/MaterialIcons-Regular.ttf (Apache
2.0) on the 24-unit grid the sprite uses (partials/icon-sprite-url.html):

    python3 tools/icon-path.py search offline_pin

prints "name path" lines. Needs fontTools (pip install fonttools).
"""
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

FONT = Path(__file__).resolve().parent / "sources/MaterialIcons-Regular.ttf"


def number(value: float) -> str:
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return "0" if text in ("-0", "") else text


def main(names: list[str]) -> int:
    font = TTFont(FONT)
    glyphs = font.getGlyphSet()
    letters = {glyph: chr(code) for code, glyph in font.getBestCmap().items()}
    # The icons are ligatures: the letters of a name become its glyph
    ligatures = {}
    for lookup in font["GSUB"].table.LookupList.Lookup:
        for table in lookup.SubTable:
            table = getattr(table, "ExtSubTable", table)
            for first, entries in getattr(table, "ligatures", {}).items():
                for entry in entries:
                    name = "".join(letters.get(g, "?") for g in [first, *entry.Component])
                    ligatures[name] = entry.LigGlyph
    scale = 24 / font["head"].unitsPerEm
    status = 0
    for name in names:
        glyph = ligatures.get(name)
        if glyph is None:
            print(f"{name}: no such icon", file=sys.stderr)
            status = 1
            continue
        pen = SVGPathPen(glyphs, ntos=number)
        glyphs[glyph].draw(TransformPen(pen, (scale, 0, 0, -scale, 0, 24)))
        print(name, pen.getCommands())
    return status


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
