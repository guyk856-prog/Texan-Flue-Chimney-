import { z } from "zod";
export const checklistSchema = z
  .array(
    z
      .object({
        key: z
          .string()
          .regex(/^[a-z0-9_]+$/)
          .max(100),
        title: z.string().trim().min(1).max(150),
      })
      .strict(),
  )
  .min(1)
  .max(50)
  .refine(
    (v) => new Set(v.map((x) => x.key)).size === v.length,
    "Checklist keys must be unique.",
  );
export const CHIMNEY_CHECKLIST = checklistSchema.parse(
  [
    "Firebox",
    "Refractory panels",
    "Damper",
    "Smoke shelf",
    "Smoke chamber",
    "Flue liner",
    "Crown",
    "Masonry",
    "Mortar",
    "Chase cover",
    "Cap",
    "Flashing",
    "Roofline exterior",
    "Clearances and venting observations",
  ].map((title) => ({ key: title.toLowerCase().replaceAll(" ", "_"), title })),
);
export const DRYER_CHECKLIST = checklistSchema.parse(
  [
    "Dryer connection",
    "Accessible duct run",
    "Exterior termination",
    "Lint observations",
    "Accessibility and airflow observations",
  ].map((title) => ({ key: title.toLowerCase().replaceAll(" ", "_"), title })),
);
export const CONSENT_VERSION = "electronic-records-v2-2026-11";
export const CONSENT_TEXT =
  "Electronic records and signatures disclosure (E-SIGN / UETA). Please read before signing. " +
  "By selecting the consent checkbox and then Approve & Sign (or Acknowledge & Sign), you agree to use electronic records and your typed name as your signature for this exact document version. " +
  "Consent covers this document and its signing record only. You may instead request a paper copy or a paper signing process by calling the office at the telephone number shown on this document. No paper-copy fee is charged. " +
  "You may withdraw consent for future electronic records by calling that office number and identifying the document and your preferred paper contact details. Withdrawal does not undo an earlier signature or alter a previously issued record. " +
  "To view and keep this record, you need internet access, a current web browser supporting HTTPS, a PDF reader, and the ability to download and save a PDF or print it. A working email address is needed only if you request delivery by email. Download and retain your copy; the share link expires and is not permanent storage. " +
  "Our record retention policy is seven years after issue; a hold or an unresolved matter may require longer retention. You may request a copy during that period using the office number on the document. " +
  "Review the full scope, amount, terms and limitations before signing. This action records approval or acknowledgment of this document only and does not authorize work outside its stated scope. By consenting, you confirm that you can access this disclosure and save or print the record.";
