import "dotenv/config";
import { PrismaClient, UserRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { z } from "zod";
const db = new PrismaClient();
const entries: [string, string, string[]][] = [
 ["Chimney Sweep / Inspection", "Cleaning", ["Review accessible wood-burning fireplace areas and record access limitations.", "Sweep accessible flue surfaces and remove loosened debris."]],
 ["Heavy Soot or Creosote Cleaning", "Cleaning", ["Assess visible buildup and agree the cleaning method before work.", "Remove accessible buildup within the agreed scope and record remaining limitations."]],
 ["Level 3 Cleaning", "Cleaning", ["Company-defined cleaning term, not an NFPA inspection level.", "Review heavy buildup and agree mechanical cleaning areas and access with the customer.", "Remove accessible deposits using the agreed methods; document areas requiring further work."]],
 ["Smoke Chamber Parging", "Repair", ["Review accessible smoke chamber surfaces.", "Prepare agreed areas and apply suitable parging material; record access limitations."]],
 ["Smoke Chamber Repair", "Repair", ["Record visible smoke chamber damage.", "Repair only agreed accessible areas using selected materials."]],
 ["Stainless Steel Chimney Liner Installation", "Installation", ["Verify appliance, flue dimensions and proposed liner requirements on site.", "Install the agreed liner system and record materials used."]],
 ["Chimney Cap Installation", "Installation", ["Verify flue dimensions and attachment points.", "Fit the agreed cap and record the installation."]],
 ["Round Chimney Cap", "Installation", ["Verify round flue dimensions and attachment requirements.", "Fit the selected round cap."]],
 ["Chase Cover Replacement", "Repair", ["Verify chase dimensions and existing cover condition.", "Remove the agreed cover and fit the selected replacement."]],
 ["Chimney Crown Repair / Rebuild", "Repair", ["Record visible crown condition and agree repair or rebuild areas.", "Prepare and restore the agreed areas using selected materials."]],
 ["Chimney Flashing Repair", "Repair", ["Review accessible roof-to-chimney junctions.", "Repair agreed flashing areas and document roof access limitations."]],
 ["Chimney Masonry / Tuckpointing", "Repair", ["Identify agreed damaged masonry or mortar joints.", "Prepare and repair selected areas using matched materials where available."]],
 ["Chimney Chase Framing Reconstruction", "Repair", ["Assess exposed chase framing within agreed access limits.", "Reconstruct the agreed framing areas; report concealed damage before additional work."]],
 ["Chimney Chase Siding Replacement", "Repair", ["Measure and identify siding sections for replacement.", "Remove selected siding and fit agreed replacement materials."]],
 ["Refractory Panel Replacement", "Repair", ["Verify appliance model and panel dimensions.", "Replace agreed panels using suitable selected parts."]],
 ["Firebox Masonry Repair", "Repair", ["Record visible firebox masonry condition.", "Repair agreed accessible sections using selected materials."]],
 ["Fireplace Glass Doors (measurements verified)", "Installation", ["Verify opening measurements and appliance suitability on site.", "Fit the selected door assembly after measurement confirmation."]],
 ["Animal Removal (when appropriate)", "Maintenance", ["Assess visible animal presence and safe access before work.", "Proceed only when appropriate; refer work requiring specialist handling."]],
 ["Dryer Vent Cleaning", "Cleaning", ["Identify accessible dryer vent route and termination.", "Remove accessible lint buildup and record restrictions or inaccessible sections."]],
];
async function main() {
 const password = z.string().min(16).max(72).refine(s => Buffer.byteLength(s, "utf8") <= 72).parse(process.env.SEED_DEMO_PASSWORD);
 const passwordHash = await hash(password,12);
 const org = await db.organization.upsert({ where: { id: "texan-flue" }, update: {}, create: { id: "texan-flue", name: "Texan Flue Chimney Service", brandName: "Texan Flue Chimney", phone: "469-771-7000", email: "", website: "https://texanflue.com", addrLine1: "2781 N Carroll Ave", city: "Dallas", state: "TX", postal: "75204" } });
 await db.organizationSettings.upsert({ where: { organizationId: org.id }, update: {}, create: { organizationId: org.id, taxEnabled: false, feeEnabled: false, aiEnabled: false, defaultTerms: "DEMO configuration - review before live use." } });
 for (const role of Object.values(UserRole)) {
 const email = `demo.${role.toLowerCase()}@example.test`;
 await db.user.upsert({ where: { email }, update: {}, create: { organizationId: org.id, email, name: `DEMO ${role}`, role, passwordHash } });
 }
 for (const [index, [title, category, scopeSteps]] of entries.entries()) {
 const slug = title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/-$/,"");
 await db.serviceCatalogItem.upsert({ where: { organizationId_slug: { organizationId: org.id, slug } }, update: {}, create: { organizationId: org.id, slug, title, category, description: `DEMO starter wording - review and edit before use. ${scopeSteps.join(" ")}`, scopeSteps, materials: [], exclusions: ["DEMO scope: additional work requires separate agreement."], companyDefinedTerm: title === "Level 3 Cleaning", sortOrder: index } });
 }
 console.log("Seed complete: organization, DEMO settings, 3 DEMO users and 19 DEMO catalog entries. No prices fabricated. Existing records unchanged.");
}
main().catch(e => { console.error(e); process.exitCode=1; }).finally(() => db.$disconnect());
