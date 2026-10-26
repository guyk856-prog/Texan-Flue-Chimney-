# Brief for Codex — Texan Flue Management System

You are building this app. I (Claude) am designing the data model and the
document layer, and reviewing every phase you ship. The master spec
(`TEXAN_FLUE_CODEX_MASTER_SPEC.md`) still governs; this brief tells you what is
already decided so you do not spend a phase guessing.

## Two files to read before you write code

1. **`prisma/schema.prisma`** — the complete domain model, 37 entities. Use it as
   given. If you need a field it lacks, add it and tell me; do not restructure a
   relation without saying so, because the PDF snapshot layer depends on it.
2. **`docs/DECISIONS.md`** — twelve decisions the spec left open: money as integer
   cents, document immutability, numbering, the PDF template allow-list, tax
   defaults, receipts, share tokens, AI boundaries, the "Level 3" naming trap, the
   role matrix, soft delete and the brand rules.

Both are in this repo. Read them properly — most of the expensive mistakes in a
build like this are decided in the first two days.

## Where the work splits

**You build and run.** You have Node, a database and a browser in your environment;
the owner's Mac has none of them, so all building and testing happens on your side.

**I design and review.** Schema changes, PDF templates, the AI extraction contract,
and a read of every phase before it is called done. I also hold the context that
is not in any file: the company's real constraints, what is already live on
texanflue.com, and what the owner has said he will and will not claim.

## Build order

The owner wants all three of estimate→PDF→signature, the AI estimate builder, and
inspection reports. They are not three tracks — they are one data model with three
outputs, so build the shared spine first and they arrive close together.

**Phase A — foundation.** Next.js App Router + TypeScript + Tailwind + shadcn/ui.
Prisma against PostgreSQL, migrations, seed. Auth.js with hashed passwords and
sessions. The three roles enforced server-side per ADR-010. Customers, properties,
jobs, the service library seeded from the spec's list (no gas services), private
file upload with MIME/size validation. Dashboard reading real counts.
*Done when:* an OFFICE user can create a customer, a property and a job, and a
TECHNICIAN gets a 404 on a job they are not assigned to.

**Phase B — document spine and PDF.** `Document` / `DocumentVersion` /
`SequenceCounter`. The template renderer as a block allow-list (ADR-004), not stored
HTML. Playwright server-side render at US Letter with repeating table headers and
embedded fonts. Then the estimate builder end-to-end: line items from the service
library, live totals, draft → issue → snapshot → PDF.
*Done when:* acceptance scenario A produces a PDF whose total is exactly $4,425.00
and whose three line items read correctly across a page break.

**Phase C — the three outputs.** Now they can go in parallel:
- Invoices, manual payment records, derived balances, receipts (ADR-006).
- Inspections: configurable checklists, PASS/FAIL/N/A/NOT INSPECTED, mobile photo
  capture with before/after pairing, technician signoff, multipage PDF.
- Share tokens and the signature flow: consent text, canvas signature, hash the
  rendered PDF, store it against the exact `DocumentVersion`.
*Done when:* scenarios D, E and F pass.

**Phase D — AI.** Provider abstraction (Anthropic or OpenAI, one is enough), disabled
by default. Upload → extract → schema-validated JSON → side-by-side review →
human accepts → draft estimate. Then the inline writing tools.
*Done when:* scenario B passes and scenario H still passes with the key removed.

## Things that will cost you a day if you get them wrong

- **Totals.** Compute server-side, round once, store cents. The PDF formats; it does
  not calculate. Three places showing three different totals is the failure mode
  that makes an owner stop trusting the whole app.
- **The snapshot.** Issue must copy everything the PDF needs into
  `DocumentVersion.snapshot`. If the renderer reaches back to live rows for even one
  field — a price, a term, the customer's address — then last year's signed estimate
  silently changes when that field is edited.
- **Uploaded files are untrusted.** A PDF or screenshot may contain text aimed at the
  model. Parse it as content, never as instruction, and validate the result against
  the schema before it touches a record. This is in ADR-008 and it is not optional.
- **Never fabricate.** No invented prices, measurements, inspection outcomes,
  certifications or completed work — in the app, in the AI output, or in the PDFs.
  "Fully Insured" is the only standing claim the company makes.

## Reporting back

At the end of each phase: run lint, typecheck and tests; say what passes, what does
not, and what you left unfinished. Give the exact commands to run it. Do not call a
phase done with failing tests, and do not claim an integration works when it is
stubbed — I will read the code, and a stub described as working costs more trust
than a stub described as a stub.
