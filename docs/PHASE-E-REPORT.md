# Phase E implementation and evidence

Prepared for deployment; **not a verified live launch**. The owner confirmed that the Vercel and Neon accounts are not ready and asked us to prepare everything possible. No public preview URL, cloud login, domain or live cloud acceptance result is claimed.

## What changed

- Versioned electronic-records disclosure appears before the signing controls. Its exact text and version are stored with consent. Terms and privacy pages are substantive counsel-review drafts, linked from customer sharing and the footer. ADMIN can export a customer's records and private evidence as a ZIP, or archive the customer and revoke their share links. Physical erasure is an operator procedure, subject to document retention and holds; it is not an automated purge feature.
- Shared content-shaped loading skeletons, actionable empty states, plain recovery messages, preserved failed forms, visible focus, reduced motion, stronger text contrast and 44px-or-larger controls. Mobile inspection actions stay at the bottom of the screen.
- IndexedDB keeps inspection drafts and individual original photos on the device. Reconnection synchronizes notes with an optimistic version check. Conflicts require an explicit choice; stale writes do not silently overwrite the other device. Photo progress and retry are per file. Session warnings let the user sign in in another tab while keeping the current form open.
- ADMIN audit viewer, shared atomic database request limits on hosted instances, redacted monitoring hooks, and encrypted database-plus-private-file backups with a disposable restore verification. Nightly Actions are committed but require account secrets and explicit activation.
- Empty-database first-owner bootstrap, company/logo/library setup, no invitation step and no production demo seed. A solo ADMIN can be assigned their own fieldwork and sign off their own inspection; OFFICE cannot impersonate the assignee.
- Vercel configuration targets Node 22 and a normal server deployment. A bundled `@sparticuz/chromium` browser renders snapshots with Playwright Core inside the function. Local print fonts remain embedded; there is no external render subscription. PDF imports use PDF.js/native canvas rather than unavailable system Poppler executables. Poppler remains a test dependency.
- Production file storage uses private Vercel Blob objects. Scoped, session-bound five-minute download links stream private bytes through the server. Large uploads go directly to private quarantine with short-lived scoped tokens, then server-side byte/MIME/size validation attaches them. Transactional upload receipts make commit retries idempotent. Local filesystem storage is refused on Vercel.
- Neon runtime uses the pooled URL; migrations/backups use the direct URL. Deploy migrations are serialized under a PostgreSQL advisory lock. Preview has separate database and storage. Setup, rollback and disaster recovery are documented in [DEPLOY.md](../DEPLOY.md); every environment variable is listed in [ENVIRONMENT.md](ENVIRONMENT.md).

## Schema and role changes

Added `OrganizationSettings.onboardingCompletedAt`, operational `RateLimitBucket` and `UploadIntent` models, and the direct datasource URL. `UploadIntent.resultId` is the idempotent attachment receipt. Two real migrations implement these additions. No existing document, version, financial, inspection or signing relation was restructured. The ADMIN fieldwork clarification is recorded under ADR-010.

## Tested locally

Checks passed locally: lint, typecheck, 42 unit tests, 30 core browser regression tests, 10 mocked-provider AI browser tests, and 10 production-build Phase E browser tests. The AI and Phase E production suites were also run using Node 22.23.4. These tests use actual PostgreSQL and real browser/PDF processes, but **not** Vercel or Neon services.

- Encrypted backup and restore: PASS. Restored a consistent PostgreSQL snapshot into a disposable PostgreSQL 17 container. Matched 19 critical table counts, financial totals, 251 issued-version PDF hashes and all 345 private objects' byte counts and SHA-256 hashes. The archive was `backup_20261102042042476.bin`, SHA-256 `909b362b0b0c73dc39652a21fc98b37dc48e73cd48408cc912bfc17a68154bd8`. The archive was local; no cloud backup publication is claimed. The restore container and plaintext working files were removed.
- Bundled serverless Chromium produced a real PDF locally without a system-browser override. Scenario A printed $4,425.00. The traced workflow function measured 204,937,063 bytes across 409 files, with no missing traced files; this is a local bundle measurement, not Vercel acceptance.
- Automated Lighthouse mobile audits measured **100/100** on login, dashboard, customers, estimate builder, editable inspection, privacy and setup. Scores do not substitute for a complete assistive-technology review. Machine-readable results: [phase-e-accessibility.json](screenshots/phase-e-accessibility.json).

- Deployment locking: two simultaneous real migration commands against one fresh local PostgreSQL database completed successfully. Eight migrations applied, the second command had none pending, and no seed ran. The disposable database was removed.
- Expiry maintenance: removed an expired rate bucket, upload receipt and quarantine object while leaving a permanent-file fixture byte-identical. This runs after nightly backup/restore verification; the cloud scheduled execution is still untested.
- Session expiry: the database session was actually expired, the warning changed to ended, sign-in completed in a second tab, and the original tab retained the filled form.

## Screenshot coverage

All Phase E browser screenshots are full-page PNGs at a 375px viewport. The separate estimate-PDF image is a rasterized US Letter first page. They show all five first-run steps/screens, eight empty resource lists, populated dashboard/resource/settings screens, a real shared loading skeleton and route error boundary, a failed customer action retaining values, a session warning, offline inspection notes, conflict resolution, a queued photo, the signing disclosure and the audit log. Their names start `docs/screenshots/phase-e-`.

This is **representative shared-state coverage, not a screenshot of every possible route in each of four states**. That exhaustive route-by-state visual acceptance remains unfinished. A blank form, a static policy and a detail route do not all have meaningful identical empty states; those cases still need a deliberate route-specific review.

## Claim scan

The application/document/email source scan is empty. The full tracked-repository scan is **not empty**: four matches remain in two original third-party font notices. Those notices must accompany the fonts, and their required license text was preserved. They are not company claims and are never rendered as customer-facing copy. The only full-scan matches are at lines 3 and 19 of each font notice; the literal whole-repository-empty acceptance is therefore not met. Historical prose was rewritten to preserve the restriction without introducing disallowed customer-facing wording; the AI denylist still rejects that wording at runtime.

## Written but not exercised against the real services

Vercel deployment/configuration, private Blob direct-upload SDK and cloud persistence, Neon pooled/direct connectivity, production proxy cookies/CSRF, SMTP delivery, monitoring-webhook delivery, Actions scheduling and cloud disaster recovery. The provider-independent storage adapter has unit tests; local upload quarantine and retry behavior have browser/API tests. None proves a real cloud deployment works.

## Unfinished and required before use

1. Create/connect the Vercel and Neon accounts, configure separate production/preview stores and databases, set secure variables, deploy and attach `app.texanflue.com`. Follow [DEPLOY.md](../DEPLOY.md).
2. On the real deployment, create the owner without demo records; test login/logout/reset, anonymous phone sharing and cookies/origin protection. Issue/download the exact $4,425.00 PDF and upload a photo, redeploy, then verify the original photo and PDF remain readable.
3. Configure SMTP and a monitoring destination; activate nightly backups only after the first cloud backup/restore drill passes. The cloud recovery workflow requires a new empty database and store and does not switch the app automatically.
4. Confirm current provider prices at checkout. Official pricing pages were blocked here; the documented $25–40/month planning range is not a verified current quote.
5. Have counsel review the policy drafts, disclosure, seven-year retention schedule and erasure/hold procedure. Implementing a physical deletion request remains an operator responsibility.
6. Complete the exhaustive route-by-state screenshot review and a human keyboard/screen-reader check. The completed automated tests and representative screenshots are not described as that full acceptance.

No live deployment tests have been performed. Phase E's cloud acceptance and exhaustive visual acceptance remain open.

## Commands used

```sh
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run test:e2e:ai
npm run test:e2e:production
npm run backup
npm run restore:verify -- private/backups/backup_20261102042042476.bin
```

The production browser configurations run `npm run build` themselves. For the Node 22 verification on this Node 24 host, the two production suites were launched using `npm exec --yes --package=node@22 --cache /tmp/texan-node22-cache -- node node_modules/@playwright/test/cli.js test --config playwright.phase-d.config.ts` (and `playwright.phase-e.config.ts`). No AI provider was contacted: the AI suite uses the existing mock provider preload. The route-error retry was also exercised manually against a local production server after restoring the failed table; it returned to the customer list successfully. The normal local-development commands are in [README.md](../README.md); the owner uses [DEPLOY.md](../DEPLOY.md).
