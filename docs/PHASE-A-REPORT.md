# Phase A implementation and validation

Implemented: Next.js App Router / TypeScript / Tailwind with shadcn-style Radix/CVA components; PostgreSQL/Prisma migrations and idempotent DEMO seed; Auth.js credentials, bcrypt passwords, encrypted sessions backed by revocable hashed database handles; login/logout/reset; scoped customer/property CRUD, admin soft deletion; jobs, status transitions, assignments and appointments; admin catalog editing with price versions; private file upload/download; live database dashboard.

## Schema changes

Mojibake in comment lines and inline comments was repaired to readable ASCII. One inverse relation field was required for Prisma validation: `ServiceCatalogItem.estimateLineItems EstimateLineItem[]`. No scalar field, index, foreign key or existing relation changed. The initial migration includes all 38 models and 18 enums. A second migration adds `job_number_seq` for unique job numbering; no document counters or snapshots were repurposed.

## Actually exercised

- Docker Compose PostgreSQL startup and readiness.
- Prisma validation and client generation; actual SQL migrations, not `db push`.
- Both migrations applied from scratch to a second empty PostgreSQL database. DEMO seed run twice there: exactly 1 organization, 1 settings row, 3 users, 19 services, 0 invented price rows.
- Frozen-lockfile `npm ci`, ESLint, TypeScript and optimized Next.js build. Optimized server started successfully; `npm run smoke` verified actual Auth.js login, authenticated PostgreSQL counts and sign-out revocation. Desktop/mobile screenshots captured from the actual app; no horizontal overflow at a 390px viewport.
- 13 Vitest unit tests: role policy, scoped queries, CSRF origin validation, rate limiting, tokens, input/mass-assignment validation, appointments, integer-cent prices/company-defined scope, job transitions and upload limits/type matching.
- 8 Playwright browser/integration tests against PostgreSQL and system Chromium: OFFICE customer/property/job creation; search and mutation validation; technician 404s and admin-route 403s; assignment grants/revocation; tenant isolation and property ownership; oversize/disallowed/spoofed upload rejection and signed session-bound downloads; price history and admin soft deletion; private reset-email capture, one-use reset, session revocation, new login and logout.

Some UI paths are exercised by HTTP rather than button interaction: price edits, assignment changes, appointment creation and soft deletion. UI forms exist for each. No provider mocks are presented as functioning external integrations.

## Remaining work and limitations

- Production SMTP delivery is implemented as a configurable transport but not tested with a provider. Local reset-email capture is tested. Company email remains blank pending a verified address.
- Company settings are read-only. User provisioning/role administration, MFA, branding uploads and editable tax settings are not built; three DEMO roles are seeded. These should be addressed before live onboarding.
- Private local filesystem storage works. S3 storage, antivirus scanning, image transformation, PDF page-count parsing and retention automation remain unimplemented. Allowed files are validated by extension, MIME, size and leading bytes, not a malware scanner; downloads are sandboxed attachments.
- Rate limiting is per process. Shared/distributed limits and production reverse-proxy limits remain deployment work.
- Lists return up to 200 matching records and do not yet paginate. Appointments can be created and read; ADMIN can remove them. Rescheduling currently means removing and recreating an appointment.
- No live deployment, DNS, TLS, external mail or cloud snapshot restoration was validated. Backup/restore instructions are written but not tested as a disaster-recovery procedure.
- Estimates/PDFs, document immutability operations, invoices/payments/receipts, inspection workflows, signatures, AI and other later phases are not built. Dashboard counts read the existing tables; later-phase workflows have no create UI yet. Overdue follow-ups are not fabricated because the supplied schema has no follow-up scheduling field.

Run commands are in the root README. Phase A local acceptance is determined by the actual validation results above, not by a production-readiness claim.
