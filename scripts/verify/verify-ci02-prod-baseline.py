#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CYP-memo CI02 gate wrapper → 军械库 SSOT.

Delegates to:
  d:\\kf\\CYP-skill-arsenal\\gcc\\workspace\\cmd-line\\tools\\phase-gate\\cyp-tool-ci02-prod-baseline-gate.py
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ARSENAL_TOOL = Path(
    r"d:\kf\CYP-skill-arsenal\gcc\workspace\cmd-line\tools\phase-gate\cyp-tool-ci02-prod-baseline-gate.py"
)


def main() -> int:
    root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd().resolve()
    if not ARSENAL_TOOL.is_file():
        print(f"missing arsenal tool: {ARSENAL_TOOL}")
        return 2
    return subprocess.call([sys.executable, str(ARSENAL_TOOL), str(root)])


if __name__ == "__main__":
    sys.exit(main())
