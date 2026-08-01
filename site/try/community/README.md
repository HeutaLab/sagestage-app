# Sage Stage — community template bank

This folder is a **template source**: push it to any static host (GitHub Pages
is the intended home) and every Sage Stage user who adds its URL sees these
templates on their dashboard.

## How it works

- `index.json` is the catalog. Each entry has `file`, `name`, `category`,
  `description`, `author`, and an optional `sketch` (widget types + fractional
  positions only) that Sage Stage uses to draw a live thumbnail — no images to
  host.
- Each `file` is a full template: screens with a `background` and `widgets`
  whose positions are **fractions of the display** (`fx`/`fy`/`fw`/`fh`,
  0–1), so layouts scale from a laptop to a projector.

## Contributing a template

1. Build your screens in Sage Stage.
2. On the dashboard, open your deck's ⋮ menu → **Copy as template JSON**.
3. Add the JSON as a new file here, append an entry to `index.json`
   (copy the `screens` → strip `props` for the `sketch`), and open a pull
   request.

Templates are data only — Sage Stage drops unknown widget types on import and
shows teachers every URL a template contains before first use. Please keep
embedded links classroom-appropriate and avoid large embedded images.

## Hosting your school's own bank

Copy this folder, keep the same file shapes, publish it with GitHub Pages
(Settings → Pages → deploy from branch), and share the URL with your
colleagues — they add it via **Templates → Add a school source…**.
