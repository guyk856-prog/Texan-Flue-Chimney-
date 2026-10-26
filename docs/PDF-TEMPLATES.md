# PDF templates

Twelve document types, one renderer. A template is **not** HTML held in the
database — it is an ordered list of typed blocks (ADR-004), rendered by React
components and printed by Playwright.

## The block contract

`TemplateVersion.source` is JSON:

```jsonc
{
  "blocks": [
    { "type": "header",         "options": { "showTagline": true } },
    { "type": "docTitle",       "options": { "label": "CUSTOMER ESTIMATE" } },
    { "type": "partyBlock",     "options": { "columns": ["customer", "property"] } },
    { "type": "lineItemTable",  "options": { "columns": ["service","detail","qty","unitPrice","total"] } },
    { "type": "totals",         "options": { "showDeposit": true } },
    { "type": "richText",       "options": { "field": "terms", "heading": "Terms" } },
    { "type": "photoGrid",      "options": { "source": "findings", "perRow": 2 } },
    { "type": "signatureBlock", "options": { "mode": "customer" } },
    { "type": "footer",         "options": { "disclaimer": "estimate" } }
  ]
}
```

An admin reorders blocks and edits the copy inside `richText` and `footer`.
No block accepts raw markup. Anything not in the allow-list is dropped at render,
not escaped — a template that silently renders nothing is better than one that
renders an injected `<script>` into a document we email to a customer.

## Fonts — do not use the website's stack

texanflue.com uses system fonts (`Hoefler Text`, `-apple-system`). That is correct
for a web page and wrong for a PDF: the office Mac has Hoefler Text, the Linux
render container does not, and the same estimate comes out in two different faces.

Embed these instead, as local `.woff2`/`.ttf` files in `templates/fonts/`:

| Role | Face | Why |
|---|---|---|
| Display / headings | **Libre Baskerville** | The site's serif stack names Baskerville first; this is the open face that matches that intent and embeds cleanly. |
| Body / tables | **Source Sans 3** | Neutral, excellent at 9–10pt, full figure set including tabular numerals. |
| Numbers | Source Sans 3 with `font-variant-numeric: tabular-nums` | Money columns must align on the decimal. |

Ship the font files in the repo. Do **not** `<link>` Google Fonts from the render
template — the container may have no network, and a silent fallback is a bug you
only notice in a customer's inbox.

## Print palette ≠ screen palette

The website is a dark design: `#0a0a0c` ground, `#c9a24a` gold.
Documents print on white paper and use the spec's palette:

```
ink          #111111     rule        #DDD8CE
gold         #C5A15B     paper       #FFFFFF
gold-deep    #8A6827     paper-warm  #F6F4F0
muted        #6F6A63     bad         #9B2C2C   (FAIL status only)
```

These are deliberately different, not a conflict. Gold on near-black is a screen
treatment; the same gold on white at 9pt is what reads in print and photocopies.

## Pagination rules the renderer must honour

- `@page { size: letter; margin: 0.6in 0.55in 0.75in }`.
- Table headers repeat: `thead { display: table-header-group }`.
- A line item never splits across pages: `tr { break-inside: avoid }`.
- A section heading never ends a page: `h2 { break-after: avoid }`.
- Signature block never splits: `break-inside: avoid`.
- Page numbers come from Playwright's `footerTemplate`, not from CSS counters —
  CSS `counter(pages)` is unreliable in headless Chromium.
- Long descriptions must wrap, not clip. Test with a 600-character line item.

## Per-type disclaimers

Each footer carries the disclaimer for its type. These are required, not decorative:

- **estimate** — "This is a proposal, not an invoice. No work is scheduled or
  authorized until you approve it. Prices are valid until the date shown."
- **invoice** — "Payment is recorded manually by our office. This document is not a
  payment page and does not process cards."
- **inspection** — "This report records what was visible and accessible on the date
  of inspection. Areas listed as Not Inspected were not examined. It is not a
  code-compliance certification."
- **receipt** — "Receipt for a payment recorded by our office on the date shown."
- **work authorization** — "Authorizes the scope described above. Additional work
  requires a separate change order."

Never add "guaranteed", "certified", "licensed", "code compliant" or an inspection
level to any footer. "Fully Insured" is the only standing claim.

## Acceptance

`estimate.html` in this folder is the reference render for acceptance scenario A:
three line items totalling **$4,425.00**, tax and fee shown as excluded, correct
across a forced page break. Render it, print it, and compare before wiring the
component version.
