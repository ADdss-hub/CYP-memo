# scripts/clean

Clean build/temp artifacts.

## Default

Removes `dist` folders and common temp dirs. **Does not delete databases.**

## Purge

```bat
scripts\clean\clean-local.bat --purge
```

Requires typing `YES`. Still does not delete DB/data dirs.