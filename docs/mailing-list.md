# The mailing list — setup runbook and the rules it lives by

Decided 2026-08-01 (SageStage/docs/sagestage-app-design.md §4): **soft capture**.
The download is never gated; the signup is optional, beside it. The site LINKS
to the provider's hosted page — nothing embeds, so sagestage.app keeps zero
third-party requests. Provider: **MailerLite free tier** (£0 to 500
subscribers, double opt-in, CSV export so the choice is never permanent).

## The rules (worth more than the tooling)

- The list exists for exactly two kinds of email: **release news** ("the
  polished installer is out") and the **staffroom nudge** ("this is the update
  — but have your staff seen the story map?"). Nothing else. No streaks, no
  re-engagement campaigns, no "we miss you".
- Cadence: when there's something worth a teacher's minute — realistically
  monthly at most, silent over holidays. An ignored list is quit; a quiet one
  is trusted.
- Every address arrived by **double opt-in** and leaves by one click. Never
  import addresses from anywhere else, however friendly the source.
- The voice is the help site's voice: warm because it's specific, never
  because it's adjectival.

## Glenn's ten minutes (one-time)

1. **Create the account** at mailerlite.com — use the address you're happy to
   send from (their new-account approval usually clears within a day; saying
   "education software newsletter, opt-in only" in the approval form helps).
2. **Settings worth setting immediately:**
   - Subscribe settings → **double opt-in ON** for forms (the GDPR consent
     receipt is then theirs to keep for you).
   - Create one **group**: `Sage Stage updates` (groups are free labels;
     one is enough until the suite apps need their own).
3. **Create the signup page**: Forms → **Landing page** (not embedded form) →
   attach the `Sage Stage updates` group. Keep it to a heading, one sentence,
   the email field, and the button — the site's paragraph has already made the
   promise, the form just keeps it. Publish and **copy the URL**.
4. **Hand the URL over** — the two site blocks (landing + workshop pages) are
   sitting commented in the HTML with `SIGNUP-URL` placeholders; swapping the
   URL in and removing the comment markers activates them, then a deploy click
   publishes.
5. **Optional but worth it — domain authentication** (Settings → Domains →
   authenticate): MailerLite shows two/three DNS records (DKIM CNAMEs, maybe
   SPF). They go into Hover exactly like everything this week — mind the
   hostname column, it will be a subdomain like `ml._domainkey`, entered as
   given, never `@`, never `*`. This removes the "via mailerlite" tag and
   keeps school spam filters friendly. Do it before the first real send, not
   necessarily today.

## Sending copy

Drafts for the first two emails live in `docs/emails/` — the double-opt-in
welcome and the shape of a nudge. Paste, adjust, send; they are starting
points in the right register, not scripts.
