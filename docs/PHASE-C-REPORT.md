# Phase C: invoices, inspections and customer signatures

## Delivered

Invoices can start from a scratch draft or an approved estimate. Conversion preserves `sourceEstimateId` and the issued, approved snapshot's lines, amounts, scope and parties without consulting new catalog prices or tax settings. Scratch drafts are editable; converted amounts are read-only. Issuing a scratch invoice recalculates its totals server-side using current settings. Money calculations remain integer cents with BigInt arithmetic and half-up rounding inherited from Phase B.

Invoice reads and ledger writes derive paid/balance from non-reversed PaymentRecords. Status derives from issue date, payment sum, due date against today's America/Chicago calendar date, share-link issuance, and explicit void metadata. No client can set status, paid amount or balance. A past-due unpaid invoice is OVERDUE, including one with a partial payment. SENT records creation of a delivery link, not successful email delivery. Void requires a reason; an invoice with payments must have those payments reversed first.

Cash, check, Zelle, bank transfer and other records require affirmative confirmation that money was received elsewhere. Concurrent payments lock the invoice and cannot overpay. A receipt and its immutable PDF are created in the same transaction after the PaymentRecord. A database trigger additionally rejects receipts without a matching, non-reversed payment. Reversal retains immutable money facts, sets a reason/timestamp, writes the audit trail, appends a VOID receipt version and revokes receipt links. Old receipt versions stay readable to authorized staff; no payment or receipt is deleted. Invoice balance changes append versions rather than changing issued PDFs.

CHIMNEY starts with the fourteen master-spec inspection areas; DRYER_VENT starts with five accessible dryer-vent areas. ADMIN can version checklists, which affect new reports. Each finding has PASS, FAIL, N/A or NOT INSPECTED, severity, observation and recommendation. Phone controls have large touch targets and camera capture input. JPEG/PNG/WebP uploads are validated server-side, compressed for display/PDF and retain byte-identical private originals. Captions, pair keys and before/after labels print with the photos. A report is capped at thirty photos, each original at 10 MiB; decoded pixel and compressed-photo limits prevent unbounded PDF payloads.

Only the assigned report technician signs off. Finalization requires that sign-off and nonblank limitations; TECHNICIAN can finalize only their own inspection. Finalized PDFs contain frozen summary, all statuses, limitations, recommendations, technician sign-off and embedded photos. Selected FAIL findings can be recorded by a technician for office review, with no suggested price or automatic estimate. Office enters each explicit integer-cent price before creating an estimate.

Customer links use 32 random bytes, hash-only storage, a default fourteen-day TTL from organization settings, revocation, token/IP rate limits, and one fixed DocumentVersion. Public routes do not read a session. Unknown, expired and revoked tokens have the same response. Views increment the token counters and move SENT estimates to VIEWED. Full snapshot scope, amount, terms and limitations precede a separate affirmative electronic-consent checkbox and typed-name signature. Decline/request-changes is a separate action. Signature/ConsentRecord retain the exact consent text/version, action, contact details when supplied, UTC timestamp, user agent and available IP. IP is explicitly an audit detail, never identity verification.

Approval locks the document and rechecks the token, then appends a new immutable signed PDF/version with SHA-256 and marks an estimate APPROVED. The old PDF bytes remain unchanged. Concurrent approval succeeds once. Original signing tokens close; distinct new capabilities bind to the signed version and approval certificate and inherit the original expiry. PostgreSQL guards signatures, consents and audit logs against update/delete. When company settings require estimate signatures, a manual office status change cannot bypass that requirement.

Invoice, receipt, chimney, dryer and approval-certificate blocks share the Phase B offline-font renderer, private loopback rendering, pagination and immutable storage. Inspection findings and photo grids extend the block allow-list without stored HTML. Each defined type disclaimer is verbatim. **Contract decision:** PDF-TEMPLATES.md supplies no separate approval-certificate disclaimer; the certificate retains its originating estimate or inspection disclaimer rather than inventing one.

## Schema and implementation decisions

The only Phase C Prisma schema addition is optional `InspectionPhoto.originalFileId`, its `originalFile` relation and the `FileAsset.originalInspectionPhotos` inverse. This links an original to its compressed display photo; no existing relation was restructured. Two real migrations add that foreign key and the ledger/signature/audit guards. No new models were introduced. Receipt void state derives from its reversed payment and new VOID snapshot, preserving the existing schema.

Renderer inputs contain the full template, parties, money, findings, compressed photo bytes and signatures. It reads no live database rows or network fonts. Existing issued snapshots remain compatible. Actual timestamps display in America/Chicago; calendar due/valid dates remain calendar dates.

## Run locally

Requires Node 22.12+ (tested on Node 24), Docker Compose, Chromium and, for PDF assertions, Poppler (`poppler-utils` on Linux or `brew install poppler` on macOS).

```sh
npm ci
npm run setup:env
docker compose up -d --wait
npm run db:generate
npm run db:migrate
npm run db:seed
npx playwright install chromium
npm run dev
```

Demo accounts and password handling are in README.md. If using a system Chromium instead, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` in the ignored `.env`; omit the browser-install command. Never seed a real customer database. Deploy the full checkout with `scripts/render-pdf.tsx`, `src`, fonts, Chromium and production dependencies; a bare Next standalone artifact is insufficient for the isolated PDF worker.

```sh
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm start
```

The E2E suite uses the local DEMO database and creates its own clearly labeled fixtures. A system-browser invocation is `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`.

## Actually tested

- ESLint, TypeScript, 29 Vitest tests, optimized production build, and all 29 Playwright tests (8 Phase A, 10 Phase B, 11 Phase C) against real PostgreSQL and Chromium. No mocked authorization in browser/API acceptance checks.
- The optimized production server passed login/dashboard/logout checks, created and issued a scratch invoice, recorded a 100000-cent check, and downloaded the matching-hash receipt PDF with a 342500-cent balance. A separate production scratch draft was withdrawn with a required reason and computed VOID status.
- Six migrations applied successfully to a separate empty database; seed ran twice successfully there. Existing demo database was migrated and seeded as well.
- Scenario D: all four statuses, required limitations, before/after photos and byte-identical private originals; compressed dimensions, embedded PDF images, multipage text, disclaimers, owner-only sign-off/finalization and immutable SQL guards. Phone form tested at 390×844 with large controls and camera input attributes.
- Scenario E: anonymous review, denied unchecked consent, explicit consent/signature through the browser, exact original versus signed snapshot versions, SHA-256 matching saved bytes, signed PDF download, approval certificate, unchanged original bytes and closed original token. Also tested declined responses, replay/concurrent approval, signature-required policy and append-only database guards.
- Scenario F: converted the approved **$4,425.00** estimate while company tax/fee settings differed, preserving approved total and zero tax/fee. OFFICE issued and recorded a **$1,000.00 CHECK** through the UI. Extracted receipt PDF shows **$3,425.00** balance. A direct receipt insert without payment was rejected. TECHNICIAN payment writes were rejected.
- Reversal retained payment facts and old receipt snapshot, appended a void receipt, revoked its capability and required reasons. Scratch edits, computed overdue, concurrent overpayment prevention, foreign-organization invoice/receipt/payment denials, selected-FAIL repair pricing, dryer checklist/acknowledgment, admin-only checklist edits, unknown/expired/revoked equality and rate limiting passed.
- Phase A/B regression includes exact 442500-cent totals, BigInt monetary arithmetic checks, snapshot isolation after live edits, private uploads, assigned-job access, numbering concurrency and repeating table headers with unsplit rows.
- PNGs in `docs/screenshots/phase-c-*` are actual browser screenshots or rasterized PDFs, not mockups. PDF first pages plus inspection page two, invoice and approval certificate are included.

## Explicitly unfinished / not tested

- No document email/SMS delivery, card capture, checkout, automatic bank reconciliation or AI. Users copy/deliver links themselves. Real SMTP delivery and a deployed public production origin were not tested.
- Rate limits are shared across route bundles within one Node process, not across replicas. Production requires a shared/upstream limiter. Client IP is recorded only with `TRUST_PROXY=true` behind a proxy that replaces spoofable forwarding headers; without it, direct anonymous traffic shares one conservative bucket and IP is null.
- Typed-name signatures are implemented; a drawn-signature canvas, identity verification and third-party signing service are not. Real phone camera hardware was not exercised; browser viewport, touch dimensions, capture attributes and server image uploads were exercised. HEIC is not accepted.
- The existing PDF block/copy editor remains estimate-only. The five Phase C layouts are seeded, typed and versioned in the database; this phase adds a checklist editor, not a general editor UI for those new document layouts.
- Signed-off inspections cannot be reopened/edited; a new inspection is required for a correction. No report-revision UI was added. Office can finalize a technician-signed report; it cannot impersonate technician sign-off.
- Rendering remains synchronous with local private storage. No distributed render queue, S3 adapter, malware scanning, production backup/restore exercise or high-availability deployment was added. Earlier user administration, MFA and company tax-settings editing UI limits remain.
