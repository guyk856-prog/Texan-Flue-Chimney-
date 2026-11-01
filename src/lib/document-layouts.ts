import { DocumentType } from "@prisma/client";
import { DEFAULT_ESTIMATE_LAYOUT, type Layout } from "./template-contract";
export function layoutFor(type: DocumentType): Layout {
  const label: Partial<Record<DocumentType, string>> = {
    INVOICE: "INVOICE",
    RECEIPT: "PAYMENT RECEIPT",
    INSPECTION: "CHIMNEY INSPECTION REPORT",
    DRYER_VENT_REPORT: "DRYER VENT REPORT",
    APPROVAL_CERTIFICATE: "APPROVAL CERTIFICATE",
  };
  const disclaimer =
    type === "INVOICE"
      ? "invoice"
      : type === "RECEIPT"
        ? "receipt"
        : type === "INSPECTION" || type === "DRYER_VENT_REPORT"
          ? "inspection"
          : "estimate";
  const inspection = type === "INSPECTION" || type === "DRYER_VENT_REPORT";
  const blocks = DEFAULT_ESTIMATE_LAYOUT.blocks
    .filter(
      (b) =>
        !(inspection && ["lineItemTable", "totals"].includes(b.type)) &&
        !(
          type === "RECEIPT" &&
          ["lineItemTable", "totals", "signatureBlock", "richText"].includes(
            b.type,
          )
        ),
    )
    .map((b) =>
      b.type === "docTitle"
        ? { ...b, options: { label: label[type] ?? "CUSTOMER ESTIMATE" } }
        : b.type === "signatureBlock" && inspection
          ? { ...b, options: { mode: "technician" } }
          : b.type === "footer"
            ? { ...b, options: { disclaimer } }
            : b,
    ) as Layout["blocks"];
  if (inspection)
    blocks.splice(
      3,
      0,
      {
        type: "richText",
        options: {
          field: "limitations",
          heading: "Limitations / areas not examined",
        },
      },
      { type: "richText", options: { field: "summary", heading: "Summary" } },
      { type: "inspectionFindings", options: {} },
      { type: "photoGrid", options: { source: "findings", perRow: 2 } },
      {
        type: "richText",
        options: { field: "recommendations", heading: "Recommendations" },
      },
    );
  if (type === "INVOICE")
    blocks.push({
      type: "richText",
      options: {
        field: "paymentInstructions",
        heading: "Payment instructions",
      },
    });
  return { blocks };
}
