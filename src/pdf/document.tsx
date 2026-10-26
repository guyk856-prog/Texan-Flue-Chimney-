import React from "react";
import type { EstimateSnapshot } from "../lib/snapshot";
import { formatCents } from "../lib/money";
import { parseLayout } from "../lib/template-contract";
const labels = {
  service: "Service",
  detail: "Detail / scope",
  qty: "Qty",
  unitPrice: "Unit price",
  total: "Total",
};
export function EstimateDocument({
  snapshot: s,
}: {
  snapshot: EstimateSnapshot;
}) {
  return (
    <>
      {parseLayout(s.template).blocks.map((block, index) => {
        switch (block.type) {
          case "header":
            return (
              <header key={index}>
                <div className="wordmark">{s.organization.brandName}</div>
                {block.options.showTagline && (
                  <div className="tagline">WHERE CHIMNEYS MEET LUXURY</div>
                )}
                <div className="company">
                  {s.organization.name}
                  <br />
                  {[s.organization.addrLine1, s.organization.addrLine2]
                    .filter(Boolean)
                    .join(", ")}
                  <br />
                  {s.organization.city}, {s.organization.state}{" "}
                  {s.organization.postal}
                  <br />
                  {[
                    s.organization.phone,
                    s.organization.email,
                    s.organization.website,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <div className="insured">Fully Insured</div>
              </header>
            );
          case "docTitle":
            return (
              <section key={index} className="title">
                <h1>{block.options.label}</h1>
                <div>
                  {s.document.number} · Version {s.document.version} ·{" "}
                  {s.document.status}
                </div>
                <div>
                  {s.document.issuedAt
                    ? `Issued ${s.document.issuedAt.slice(0, 10)}`
                    : "DRAFT — Not issued"}{" "}
                  · Valid until{" "}
                  {s.document.validUntil?.slice(0, 10) ?? "Not specified"}
                </div>
                {s.document.revisionOf && (
                  <div>Revision of {s.document.revisionOf}</div>
                )}
              </section>
            );
          case "partyBlock":
            return (
              <section key={index} className="parties">
                {block.options.columns.map((c) => (
                  <div key={c}>
                    <h2>
                      {c === "customer" ? "Prepared for" : "Service property"}
                    </h2>
                    {c === "customer" ? (
                      <>
                        <strong>{s.customer.name}</strong>
                        {s.customer.companyName && (
                          <div>{s.customer.companyName}</div>
                        )}
                        <div>{s.customer.billLine1}</div>
                        {s.customer.billLine2 && (
                          <div>{s.customer.billLine2}</div>
                        )}
                        <div>
                          {[
                            s.customer.billCity,
                            s.customer.billState,
                            s.customer.billPostal,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </div>
                        <div>
                          {[s.customer.phone, s.customer.email]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </>
                    ) : (
                      <>
                        <strong>{s.property.line1}</strong>
                        {s.property.line2 && <div>{s.property.line2}</div>}
                        <div>
                          {s.property.city}, {s.property.state}{" "}
                          {s.property.postal}
                        </div>
                        {s.property.label && <div>{s.property.label}</div>}
                      </>
                    )}
                  </div>
                ))}
              </section>
            );
          case "lineItemTable":
            return (
              <table key={index} className="items">
                <thead>
                  <tr>
                    {block.options.columns.map((c) => (
                      <th key={c} className={c}>
                        {labels[c]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.lines.map((line, i) => (
                    <tr key={i} data-line={i}>
                      {block.options.columns.map((c) => (
                        <td key={c} className={c}>
                          {c === "service" ? (
                            <>
                              <strong>{line.title}</strong>
                              {line.companyDefinedTerm && (
                                <div className="company-term">
                                  Company-defined cleaning term; not an NFPA
                                  inspection level.
                                </div>
                              )}
                            </>
                          ) : c === "detail" ? (
                            <>
                              <div>{line.description}</div>
                              {line.companyDefinedTerm && (
                                <ul>
                                  {line.scopeSteps.map((step, j) => (
                                    <li key={j}>{step}</li>
                                  ))}
                                </ul>
                              )}
                              {line.note && (
                                <div className="note">{line.note}</div>
                              )}
                              {line.discountCents > 0 && (
                                <div className="note">
                                  Line discount{" "}
                                  {formatCents(line.discountCents)}
                                </div>
                              )}
                            </>
                          ) : c === "qty" ? (
                            <>
                              {line.quantity}
                              <small> {line.unit}</small>
                            </>
                          ) : c === "unitPrice" ? (
                            formatCents(line.unitPriceCents)
                          ) : (
                            formatCents(line.lineTotalCents)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          case "totals":
            return (
              <section key={index} className="totals">
                <div>
                  <span>Subtotal</span>
                  <strong>{formatCents(s.totals.subtotalCents)}</strong>
                </div>
                {s.totals.discountCents > 0 && (
                  <div>
                    <span>Discount</span>
                    <span>−{formatCents(s.totals.discountCents)}</span>
                  </div>
                )}
                <div>
                  <span>{s.tax.label}</span>
                  <span>
                    {s.tax.enabled
                      ? formatCents(s.totals.taxCents)
                      : "Not included"}
                  </span>
                </div>
                <div>
                  <span>{s.fee.label}</span>
                  <span>
                    {s.fee.enabled
                      ? formatCents(s.totals.feeCents)
                      : "Not included"}
                  </span>
                </div>
                <div className="grand">
                  <span>TOTAL</span>
                  <strong>{formatCents(s.totals.totalCents)}</strong>
                </div>
                {block.options.showDeposit &&
                  s.totals.depositRequestCents > 0 && (
                    <div>
                      <span>Deposit requested</span>
                      <span>{formatCents(s.totals.depositRequestCents)}</span>
                    </div>
                  )}
              </section>
            );
          case "richText": {
            const text = block.options.copy ?? s[block.options.field];
            return text ? (
              <section className="rich" key={index}>
                <h2>{block.options.heading}</h2>
                <div>{text}</div>
              </section>
            ) : null;
          }
          case "signatureBlock":
            return (
              <section key={index} className="signature">
                <h2>
                  {block.options.mode === "customer"
                    ? "Customer approval"
                    : "Technician acknowledgment"}
                </h2>
                <p>
                  Signature ________________________________ &nbsp; Date
                  ______________
                </p>
              </section>
            );
          case "photoGrid":
            return null; // No inspection findings/photos exist in an estimate snapshot.
          case "footer":
            return null; // Required disclaimer and optional copy are printed on every page by Playwright.
        }
      })}
    </>
  );
}
export const PRINT_CSS = `@page { size: letter; margin: 0.6in 0.55in 0.75in; }
*{box-sizing:border-box}body{margin:0;color:#111111;background:#FFFFFF;font-family:SourceSans, sans-serif;font-size:10pt;line-height:1.35;font-variant-numeric:tabular-nums}header{position:relative;padding-bottom:12pt;border-bottom:2pt solid #C5A15B;margin-bottom:12pt}.wordmark{font-family:LibreBaskerville,serif;font-size:24pt;color:#8A6827}.tagline{font-size:8pt;letter-spacing:1.7pt;margin:5pt 0 10pt}.company{font-size:9pt;color:#6F6A63}.insured{position:absolute;right:0;bottom:18pt;color:#8A6827;font-size:9pt}h1{font-family:LibreBaskerville,serif;font-size:19pt;font-weight:400;margin:0 0 8pt}h2{font-size:10pt;color:#8A6827;break-after:avoid;margin:0 0 7pt}section.title{margin-bottom:14pt}section.title>div{font-size:9pt;color:#6F6A63}.parties{display:flex;gap:26pt;margin-bottom:16pt}.parties>div{flex:1}.items{border-collapse:collapse;width:100%;table-layout:fixed;margin-bottom:14pt}.items th{background:#F6F4F0;color:#111111;font-weight:600;border-bottom:1pt solid #C5A15B;text-align:left;padding:9pt 6pt}.items td{padding:8pt 6pt;vertical-align:top;border-bottom:0.6pt solid #DDD8CE;white-space:pre-wrap;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}.service{width:23%}.detail{width:34%}.qty{width:10%}.unitPrice,.total{width:16.5%;text-align:right!important}.company-term,.note{font-size:8.5pt;color:#6F6A63;margin-top:6pt}small{font-size:8pt}.totals{margin:8pt 0 14pt auto;width:46%;break-inside:avoid}.totals>div{display:flex;justify-content:space-between;padding:5pt 0}.totals .grand{border-top:1pt solid #C5A15B;margin-top:6pt;padding-top:9pt;font-size:14pt}.rich{margin:16pt 0;white-space:pre-wrap}.signature{margin-top:16pt;padding-top:10pt;border-top:0.6pt solid #DDD8CE;break-inside:avoid}.signature p{margin-bottom:0}ul{padding-left:13pt;margin:6pt 0}`;
