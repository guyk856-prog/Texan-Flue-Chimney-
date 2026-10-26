# Phase B: document spine, PDF renderer and estimate builder

## Delivered behavior

- Estimates have organization/year/type-scoped numbers allocated by `SequenceCounter` with explicit `SELECT ... FOR UPDATE`, within the document creation transaction. Initial allocation handles concurrent inserts; no count-based numbering.
- Draft estimates and line items are editable. All monetary arithmetic uses BigInt rational operations and half-up rounding. Quantity enters as a two-decimal string; only the persisted Prisma quantity uses Decimal. Amounts remain bounded PostgreSQL integer cents. `formatCents` converts cents only at the display edge.
- Document discount applies after line discounts. Taxable net receives its proportional share of the document discount, rounded half-up; tax applies to that taxable net. Fee applies independently to the discounted subtotal. Both require enabled company settings and document inclusion. Removal requires explicit confirmation. Deposits cannot exceed the total; negative and overflowing amounts are rejected.
- Every draft has a mutable, unissued DocumentVersion snapshot. Its document-specific tax/fee preferences are stored there without adding schema fields. Issue recalculates from live draft lines and current settings, creates the PDF, then freezes the snapshot/file/hash/issuedAt together and advances the estimate to READY.
- Snapshot JSON contains customer/billing and property details, organization contact, full line descriptions, units, quantities, prices, discounts, explicit company-term scope, totals, terms/exclusions/assumptions/warranty/customer notes, validity date, template ID AND full layout, disclaimer and footer copy. Internal notes are excluded. The isolated React/Playwright renderer imports no database code and receives no database/auth/mail credentials; it receives only this validated snapshot.
- Issued DocumentVersion rows and their FileAssets have PostgreSQL update/delete guards. The app rejects edits to issued estimates and archive requests for issued PDFs. Saved PDF bytes are authoritative; `contentHash` and FileAsset.sha256 hash those exact bytes. Re-rendering preserves content; byte-identical re-rendering is not promised because browser PDF metadata can differ.
- Revision creates a new Estimate, Document and draft DocumentVersion, links the original via supersededById and marks the original SUPERSEDED. **Schema decision:** Estimate.documentId is unique, so revisions receive a new document number and version 1 under their own Document; the old Document and its issued version remain unchanged/readable. No existing relation or Prisma schema field was changed. Duplication creates an independent draft without a revision link.
- Typed JSON blocks can be reordered and plain-text copy edited by ADMIN at `/settings/templates`. Each save creates a new template version. Unknown blocks are dropped; malformed known blocks are rejected; no stored HTML executes. Required estimate table columns/totals/disclaimer are retained. Footer copy is limited to 240 characters to fit the page footer.
- PDF rendering uses a short-lived HTTP server bound ONLY to 127.0.0.1 on a random port, behind a per-render 256-bit random path, closed after rendering. There is no public HTML render route. Browser requests other than that local HTML are blocked. Fonts are embedded as local data, with font-load checks.
- US Letter; page margins 0.6in/0.55in/0.75in; repeating table headers, unsplit rows, headings kept with following content, unsplit signature block and Playwright footer page numbers. Required disclaimer is printed verbatim on each page. Over-height rows are rejected with a clear error before issue; transaction remains DRAFT.
- OFFICE and ADMIN can save, issue, preview, download, duplicate and revise. TECHNICIAN reads are restricted to assigned jobs and cannot create/edit/issue. Current role/active/deletedAt checks remain server-side. Download links expire after five minutes and remain session-bound.

## Actually tested

- All four migrations applied to a separate empty PostgreSQL database; both immutability triggers were verified. The optimized production server passed login/dashboard/logout smoke checks and created/issued another exact 442500-cent estimate with a stored PDF hash.
- ESLint, TypeScript, production build, and 22 Vitest tests passed. A TypeScript AST/type-checker test asserts every arithmetic expression in the monetary calculation path has BigInt type, excluding the permitted display formatter.
- 8 Phase A Playwright regression tests passed, plus 10 Phase B tests against PostgreSQL and real Chromium-generated PDFs.
- Scenario A was built through the OFFICE UI, issued and downloaded: exactly three lines, $99.00 + $1,650.00 + $2,676.00 = **$4,425.00**, tax/fee not included. Extracted PDF text, stored cent totals, byte hash and embedded fonts were asserted.
- Issued a catalog-linked estimate, changed the customer's billing address, property address, catalog price and original/active template source, then re-rendered. PDF still contained original addresses, original $99.00 price and $4,425.00 total; frozen snapshot remained unchanged. Raw SQL mutation of issued versions/PDF assets was rejected.
- Revision links, independent duplication, readable old PDF, technician issue/edit denial, unassigned 404s, forged total rejection, settings-gated tax/fee amounts and required removal confirmation passed.
- Eight concurrent estimate creations generated eight different numbers. A deliberately invalid template failed creation after number allocation/document insertion; the transaction rolled back both the document and counter increment. Status transitions and date-bound expiry passed.
- A 600-character description was printed with the same three acceptance lines. A controlled plain-text template context section deliberately positioned the table across a page boundary. PDF page-two header repetition and same-page start/end markers for every line were asserted, as were disclaimer and page-number text on every page. Oversized rows that could not fit one page were rejected without an issued version/file.
- Company-defined cleaning terms retained the canonical name and explicit scope in the PDF. Unknown script blocks were discarded.
- Actual PDF rasterizations: `docs/screenshots/phase-b-estimate-first-page.png` and `docs/screenshots/phase-b-pagination-page-two.png`.

## Run

From the repository root, with Node.js 22.12+, Docker Compose and Chromium:

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

If Chromium is installed separately, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` in your ignored .env instead of installing the bundled browser; this environment uses `/usr/bin/chromium`. Runtime PDF rendering needs Playwright, tsx, the worker script, its TypeScript/React source, and templates/fonts; deploy the full checkout, not an unconfigured Next standalone bundle. These runtime packages are production dependencies.

Checks (Poppler's pdftotext, pdffonts and pdftoppm are required for PDF acceptance tests):

```sh
npm run lint
npm run typecheck
npm test
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
npm run build
npm start
```

Use `npm run test:e2e` without the executable override when using the bundled browser. Install Poppler with `brew install poppler` on macOS, or your Linux package manager's `poppler-utils` package. Tests run only against the local demo database, create clearly marked DEMO fixtures, and use an isolated organization for Phase B. No real client records are needed.

## Explicitly unfinished / limits

- SENT, VIEWED, APPROVED, DECLINED and EXPIRED are **manual office records** with server-validated transitions. No email is sent and no customer consent or signature is collected by these buttons; UI confirmations say this explicitly. Customer share links, electronic signatures and actual delivery remain Phase C work.
- This release renders estimates. Other document types have numbering prefixes and required disclaimer constants, but invoice/inspection/receipt/work-authorization workflows and their snapshot renderers are not implemented. photoGrid produces no output for estimates because no inspection findings/photos are present; it is not presented as a functioning inspection photo feature.
- No branded logo image was supplied; PDFs use the text brand mark. Font files and SIL licenses are vendored, not fetched at render time.
- Preview renders the last saved snapshot. Unsaved changes disable issue/preview/duplicate actions until saved. Saved issued PDFs are immutable; changing them requires a new numbered revision.
- PDF work is synchronous, capped at 60 seconds and 20 MiB per render. There is no background queue, distributed concurrency limiter or object-storage adapter. Production deployment, external SMTP, backups and cloud snapshot restoration were not validated in this phase.
- Phase A limits remain: company tax settings have no editing UI yet, user administration/MFA/S3/malware scanning are unimplemented, and lists cap at 200 matches.
