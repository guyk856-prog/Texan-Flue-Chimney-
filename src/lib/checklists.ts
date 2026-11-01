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
export const CONSENT_VERSION = "electronic-signature-v1";
export const CONSENT_TEXT =
  "I agree to use electronic records and my typed name as my electronic signature for this exact document version. I have reviewed its full scope, amount, terms and limitations. I can download and retain a copy. The explicit signing action records my approval or acknowledgment of this document only; it does not authorize any work outside the scope shown.";
