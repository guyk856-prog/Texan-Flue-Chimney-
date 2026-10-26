# Texan Flue Management System

Replaces ScanPay for Texan Flue Chimney Service, Dallas–Fort Worth.
App target: app.texanflue.com

## Read these before writing code

| File | What it is |
|---|---|
| `TEXAN_FLUE_CODEX_MASTER_SPEC.md` | The full product spec |
| `docs/CODEX-BRIEF.md` | Build order and how the work splits |
| `docs/DECISIONS.md` | Twelve architecture decisions already settled |
| `prisma/schema.prisma` | The complete domain model, 38 models — use as given |
| `docs/PDF-TEMPLATES.md` | The PDF block contract, fonts and print palette |
| `PHASE-A-PROMPT.txt` | The current task |

## Non-negotiable

- Money is integer cents everywhere. The PDF formats, it never calculates.
- Issued documents are immutable; editing one creates a revision.
- Tax and fees are explicit fields, off by default.
- AI is off until configured, never writes directly to a record, and treats
  uploaded documents as untrusted data.
- The only claim the company makes is **"Fully Insured"**. Never licensed,
  certified, CSIA or code-compliant.
- Wood-burning chimney and dryer vents only. No gas services.
