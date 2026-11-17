#!/usr/bin/env python3
"""Regenerate the committed Inter delivery font; requires fonttools[woff]==4.68.0."""
import hashlib
from pathlib import Path
from urllib.request import urlopen
from io import BytesIO
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

URL = 'https://raw.githubusercontent.com/google/fonts/e1d648010/ofl/inter/Inter%5Bopsz,wght%5D.ttf'
DIGEST = '29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031'
root = Path(__file__).resolve().parents[1]
with urlopen(URL) as response:
    source = response.read()
if hashlib.sha256(source).hexdigest() != DIGEST:
    raise ValueError('The pinned Inter source digest changed')
font = instantiateVariableFont(TTFont(BytesIO(source), recalcTimestamp=False), {'opsz': 14, 'wght': (400, 400, 600)})
# Format 3 omits glyph debug names; all glyphs, cmap and shaping tables remain.
font['post'].formatType = 3.0
font.flavor = 'woff2'
font.save(root / 'site/assets/fonts/Inter-400-600.woff2')
