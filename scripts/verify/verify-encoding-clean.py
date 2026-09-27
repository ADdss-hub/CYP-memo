#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CYP-memo encoding gate wrapper → 军械库 SSOT.

Delegates to:
  d:\\kf\\CYP-skill-arsenal\\gcc\\workspace\\cmd-line\\tools\\phase-gate\\cyp-tool-encoding-gate.py
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ARSENAL_TOOL = Path(
    r"d:\kf\CYP-skill-arsenal\gcc\workspace\cmd-line\tools\phase-gate\cyp-tool-encoding-gate.py"
)


def main() -> int:
    root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd().resolve()
    extra = sys.argv[2:]
    if not ARSENAL_TOOL.is_file():
        print(f"missing arsenal tool: {ARSENAL_TOOL}")
        return 2
    cmd = [sys.executable, str(ARSENAL_TOOL), str(root), *extra]
    return subprocess.call(cmd)


if __name__ == "__main__":
    sys.exit(main())
