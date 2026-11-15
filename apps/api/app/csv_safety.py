"""S09: spreadsheet-safe CSV cells (formula/DDE injection).

Text that a spreadsheet would treat as a formula (leading = + - @, tab or carriage return) is
prefixed with an apostrophe. Plain decimal numbers (including negatives such as "-120.50") are
left unchanged so numeric semantics survive.
"""

import csv
import re

_NUMBER = re.compile(r"^-?\d+(\.\d+)?$")
_RISKY = ("=", "+", "-", "@", "\t", "\r")


def cell(value):
    if value is None or isinstance(value, bool | int | float):
        return value
    text = str(value)
    if text.startswith(_RISKY) and not _NUMBER.match(text):
        return "'" + text
    return text


def row(values):
    return [cell(value) for value in values]


class _SafeWriter:
    def __init__(self, stream):
        self._writer = csv.writer(stream)

    def writerow(self, values):
        return self._writer.writerow(row(values))


def writer(stream):
    """csv.writer replacement that makes every written cell spreadsheet-safe."""
    return _SafeWriter(stream)
