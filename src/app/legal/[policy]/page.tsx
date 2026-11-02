import Link from "next/link";
import { notFound } from "next/navigation";
export default async function Policy({
  params,
}: {
  params: Promise<{ policy: string }>;
}) {
  const { policy } = await params;
  if (!["privacy", "terms"].includes(policy)) notFound();
  return (
    <main id="main-content" className="legal">
      <h1>{policy === "privacy" ? "Privacy Policy" : "Terms of Service"}</h1>
      <p className="uncertain">[REVIEW WITH COUNSEL BEFORE USE]</p>
      <p>
        This draft describes intended operating practices. It must be reviewed
        and adopted by the owner and counsel before customer use. It does not
        assert a verified legal status.
      </p>
      {(policy === "privacy"
        ? [
            [
              "Information we handle",
              "Customer contact and service-property details, job notes, photographs, proposals, invoices, payments recorded elsewhere, signing records and access/security events.",
            ],
            [
              "Purpose and access",
              "We use records to arrange service, document observations, prepare proposals, keep financial records and respond to customer requests. Team access is restricted by role and assignment.",
            ],
            [
              "Service providers",
              "The hosted configuration uses Vercel for application hosting and private file storage, Neon for the database, and the configured email provider. Optional AI processing uses Anthropic only when enabled; uploaded material may then be sent for extraction. The owner must review these providers and their terms before enabling production.",
            ],
            [
              "Retention",
              "The document policy is seven years after issue, extended when an unresolved matter or a hold requires retention. Routine archives are not immediate physical erasure. The owner must verify this policy with counsel.",
            ],
            [
              "Access, export and deletion requests",
              "Call 469-771-7000 to request a copy, correction or deletion review. The office verifies authority, records the request, exports scoped records and archives service access. Issued financial/signing records may need to be retained; requests are assessed rather than promising erasure in every case. See the documented retention and deletion procedure.",
            ],
            [
              "Security and incident contact",
              "Access controls, expiring links and private storage reduce exposure but do not eliminate risk. Call 469-771-7000 about an incident or incorrect disclosure.",
            ],
            [
              "Updates and contact",
              "Texan Flue Chimney Service, 2781 N Carroll Ave, Dallas, TX 75204. 469-771-7000. The owner must approve the final effective date and any material policy changes.",
            ],
          ]
        : [
            [
              "Operator and scope",
              "Texan Flue Chimney Service provides wood-burning chimney work and dryer-vent services. An estimate is a proposal describing its specific scope; it is not a payment page.",
            ],
            [
              "Proposals and changes",
              "Review the named property, scope, exclusions, assumptions, prices and validity date. Work outside an agreed scope requires a separate agreement. Do not rely on an expired proposal.",
            ],
            [
              "Payment records",
              "Payments are received elsewhere and recorded by the office. This application does not collect card information or process a checkout. Tax or fee removal from a document does not determine the actual obligation.",
            ],
            [
              "Electronic records",
              "Electronic signing is optional and requires a separate disclosure and affirmative consent. Paper alternatives and withdrawal instructions appear in that disclosure. A shared link grants access to one document version and expires.",
            ],
            [
              "Inspection limitations",
              "Reports record visible and accessible observations and state what was not examined. They do not expand the scope beyond the recorded areas and limitations.",
            ],
            [
              "Accounts and acceptable use",
              "Keep credentials and customer links private. Report accidental access. Do not submit material you are not entitled to share or attempt to access another customer’s records.",
            ],
            [
              "Disputes, changes and final review",
              "Call 469-771-7000 to resolve a question about a record or service. Counsel must supply any appropriate dispute, liability, jurisdiction and other operative provisions before these draft terms are adopted.",
            ],
          ]
      ).map(([title, text]) => (
        <section key={title}>
          <h2>{title}</h2>
          <p>{text}</p>
        </section>
      ))}
      <Link href="/login">Team sign in</Link>
    </main>
  );
}
