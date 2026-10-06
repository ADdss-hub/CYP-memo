# scripts/_internal

Internal helpers. **Do not invoke from project root as user entrypoints.**

| File | Role |
|------|------|
| `common.ps1` | `Get-Root`, `Test-Port`, `Invoke-Health`, `Get-ListeningPids`, `Get-PnpmCmd` |
| `write-sha256.mjs` | 制品旁路 `.sha256`（被 pack / backup 调用） |
| `write-dir-manifest.mjs` | 快照目录 `MANIFEST.sha256` |

Other one-click scripts dot-source `common.ps1`.