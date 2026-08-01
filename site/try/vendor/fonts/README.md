# Self-hosted fonts

Sage Stage is **100% local**, so its UI fonts are vendored here instead of
loaded from the Google Fonts CDN — no third-party request on boot, works fully
offline, and no pupil IP is sent to Google.

## What's here

`fetch-fonts.py` downloads the `woff2` files and generates `fonts.css`
(`<link>`ed from `index.html`). All fonts are **OFL (SIL Open Font License)** —
free to redistribute.

| Family | Weights | Role | Source |
| --- | --- | --- | --- |
| Quicksand | 500/600/700 | UI chrome | Google Fonts |
| Poppins | 500/600/700 | UI chrome | Google Fonts |
| Lexend | 400/600/700 | UI chrome | Google Fonts |
| Mali | 400/600 | UI chrome | Google Fonts |
| Atkinson Hyperlegible | 400/700 | UI chrome | Google Fonts |
| Graduate | 400 | UI chrome | Google Fonts |
| Lilita One | 400 | UI chrome | Google Fonts |
| Pacifico | 400 | UI chrome | Google Fonts |
| **OpenDyslexic** | 400/700 | Dyslexia accessibility option | Fontsource |

Only the `latin` + `latin-ext` subsets are kept (English + European accented
names); other scripts fall back to system fonts.

## Regenerate (e.g. after adding a weight)

```sh
python3 vendor/fonts/fetch-fonts.py
```

Edit the `GOOGLE_CSS` / `OPEN_DYSLEXIC` lists in the script, then re-run.

## Not bundled — by design

Fonts a school has **paid** for (cursive/handwriting schemes like Letter-join or
Sassoon, dyslexia fonts like Dyslexie) are **never** shipped here — they can't be
redistributed. The in-app font picker references those from the machine's own
install instead. See `docs/app-review-checklist.md` (P0 font item).
