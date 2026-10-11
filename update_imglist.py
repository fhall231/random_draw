#!/usr/bin/env python3
"""Rewrite the photos list in items.js from the pictures found in img/.

Usage (from the project folder):   python3 update_imglist.py

items.js must contain these two marker lines inside the photos array:
    // AUTO-IMG-START
    // AUTO-IMG-END
Everything between them is replaced; the rest of the file is left untouched.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
IMG_DIR = ROOT / "img"
ITEMS = ROOT / "items.js"
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".avif"}
START, END = "// AUTO-IMG-START", "// AUTO-IMG-END"


def main():
    if not IMG_DIR.is_dir():
        sys.exit(f"Folder not found: {IMG_DIR}")
    if not ITEMS.is_file():
        sys.exit(f"File not found: {ITEMS}")

    files = sorted(
        (p.relative_to(ROOT).as_posix()
         for p in IMG_DIR.rglob("*")
         if p.is_file() and p.suffix.lower() in EXTS),
        key=str.lower,
    )

    text = ITEMS.read_text(encoding="utf-8")
    pattern = re.compile(
        rf"^([ \t]*){re.escape(START)}.*?{re.escape(END)}", re.S | re.M
    )
    m = pattern.search(text)
    if not m:
        sys.exit(f"Markers not found in items.js. Add these two lines inside "
                 f"the photos array:\n  {START}\n  {END}")

    indent = m.group(1)
    body = "".join(f"{indent}{json.dumps(f, ensure_ascii=False)},\n" for f in files)
    block = f"{indent}{START}\n{body}{indent}{END}"
    new_text = pattern.sub(lambda _: block, text, count=1)

    if new_text != text:
        ITEMS.write_text(new_text, encoding="utf-8")
    status = "updated" if new_text != text else "already up to date"
    print(f"items.js {status}: {len(files)} image(s) in {IMG_DIR.name}/")
    for f in files:
        print("  ", f)
    if not files:
        print("Warning: no images found, so the photos list is now empty.")


if __name__ == "__main__":
    main()
