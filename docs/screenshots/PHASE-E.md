# Phase E screenshots

Real local browsers and PostgreSQL, not a hosted preview. Browser viewport: 375 × 812; full-page captures may be taller. The PDF image is a rasterized US Letter page.

| State     | Evidence                                                                                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading   | [Delayed database read](phase-e-loading.png)                                                                                                                                                       |
| Empty     | [Customers](phase-e-customers-empty.png), [jobs](phase-e-jobs-empty.png), [estimates](phase-e-estimates-empty.png), [inspections](phase-e-inspections-empty.png), [files](phase-e-files-empty.png) |
| Error     | [Route read failure](phase-e-page-error.png), [failed action keeps form](phase-e-customer-error.png)                                                                                               |
| Populated | [Dashboard](phase-e-dashboard-populated.png), [customers](phase-e-customers-populated.png), [services](phase-e-services-populated.png), [invoices](phase-e-invoices-populated.png)                 |

First run: [Create owner](phase-e-first-run-owner.png) → [Company](phase-e-first-run-company.png) → [Logo](phase-e-first-run-logo.png) → [Library review](phase-e-first-run-library.png) → [Dashboard](phase-e-first-run-dashboard.png).

Recovery: [Offline inspection](phase-e-inspection-offline.png), [saved-version conflict](phase-e-inspection-conflict.png), [individual photo queue](phase-e-photo-queued.png), [session warning](phase-e-session-warning.png).

More phone screens: [Login](phase-e-login.png), [populated private files](phase-e-files-populated.png), [new-customer form](phase-e-customer-form.png).

Trust: [Disclosure before signing](phase-e-signing-disclosure.png), [audit log](phase-e-audit-log.png), [serverless estimate PDF showing $4,425.00](phase-e-estimate-first-page.png).

[Lighthouse results](phase-e-accessibility.json): 100/100 on each of seven audited mobile screens. [Evidence report and explicit coverage limits](../PHASE-E-REPORT.md).
