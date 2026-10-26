import type { Field } from "./record-form";
const fields = (items: [string, string][]): Field[] =>
  items.map(([name, label]) => ({ name, label }));
export const customerFields: Field[] = [
  { name: "name", label: "Customer name", required: true },
  ...fields([
    ["companyName", "Company"],
    ["phone", "Phone"],
    ["billLine1", "Billing address"],
    ["billLine2", "Billing address line 2"],
    ["billCity", "Billing city"],
    ["billState", "Billing state"],
    ["billPostal", "Billing postal code"],
    ["preferredLang", "Preferred language"],
  ]),
  { name: "email", label: "Email", type: "email" },
  { name: "notes", label: "Notes", type: "textarea" },
  { name: "tags", label: "Tags (one per line)", type: "list" },
];
export const propertyFields: Field[] = [
  ...fields([
    ["label", "Property label"],
    ["line2", "Address line 2"],
    ["roofType", "Roof type"],
    ["gateCode", "Gate code"],
  ]),
  ...[
    ["line1", "Street address"],
    ["city", "City"],
    ["state", "State"],
    ["postal", "Postal code"],
  ].map(([name, label]) => ({ name, label, required: true })),
  { name: "accessNotes", label: "Access notes", type: "textarea" },
  { name: "chimneyNotes", label: "Chimney details", type: "textarea" },
  { name: "storeys", label: "Storeys", type: "number" },
  {
    name: "applianceType",
    label: "Appliance type",
    type: "select",
    options: [
      "WOOD_FIREPLACE",
      "WOOD_STOVE",
      "INSERT",
      "PREFAB_FACTORY_BUILT",
      "DRYER_VENT",
      "OTHER",
      "UNKNOWN",
    ].map((value) => ({ value, label: value.replaceAll("_", " ") })),
  },
];
export const jobFields: Field[] = [
  { name: "title", label: "Job title", required: true },
  ...["scope", "accessNotes", "safetyNotes", "internalNotes"].map((name) => ({
    name,
    label: name.replace(/([A-Z])/g, " $1"),
    type: "textarea" as const,
  })),
];
export const serviceFields: Field[] = [
  { name: "slug", label: "Slug", required: true },
  { name: "title", label: "Title", required: true },
  { name: "category", label: "Category", required: true },
  {
    name: "description",
    label: "Approved description",
    required: true,
    type: "textarea",
  },
  { name: "scopeSteps", label: "Scope steps (one per line)", type: "list" },
  { name: "materials", label: "Materials (one per line)", type: "list" },
  { name: "exclusions", label: "Exclusions (one per line)", type: "list" },
  { name: "unit", label: "Unit", required: true },
  {
    name: "companyDefinedTerm",
    label: "Company-defined term (explicit scope required)",
    type: "checkbox",
  },
  { name: "active", label: "Active", type: "checkbox" },
  {
    name: "unitPriceCents",
    label: "New price in integer cents (leave blank to retain current price)",
    type: "number",
  },
];
