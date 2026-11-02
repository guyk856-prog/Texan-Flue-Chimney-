import { actor, admin } from "@/lib/access";
import { sameOrigin, readJson, failure, HttpError } from "@/lib/errors";
import { db } from "@/lib/db";
import { openStored } from "@/lib/storage";
import { ZipArchive } from "archiver";
import { Readable } from "node:stream";
import { z } from "zod";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  try {
    const a = await actor();
    admin(a);
    const { id, action } = await params;
    if (action !== "export") throw new HttpError(404, "Not found.");
    const customer = await db.customer.findFirst({
      where: { id, organizationId: a.organizationId },
      include: {
        properties: true,
        jobs: { include: { appointments: true } },
        estimates: {
          include: {
            lineItems: {
              include: {
                aiExtraction: {
                  include: { request: { include: { sourceFile: true } } },
                },
              },
            },
            document: {
              include: {
                versions: {
                  include: { signatures: true, consents: true, pdfFile: true },
                },
              },
            },
          },
        },
        invoices: {
          include: {
            lineItems: true,
            payments: {
              include: {
                receipt: {
                  include: {
                    document: {
                      include: { versions: { include: { pdfFile: true } } },
                    },
                  },
                },
              },
            },
            document: { include: { versions: { include: { pdfFile: true } } } },
          },
        },
        inspections: {
          include: {
            sections: {
              include: {
                findings: {
                  include: {
                    photos: { include: { file: true, originalFile: true } },
                  },
                },
              },
            },
            document: {
              include: {
                versions: {
                  include: { pdfFile: true, signatures: true, consents: true },
                },
              },
            },
          },
        },
      },
    });
    if (!customer) throw new HttpError(404, "Customer not found.");
    await db.auditLog.create({
      data: {
        organizationId: a.organizationId,
        userId: a.id,
        entity: "Customer",
        entityId: id,
        action: "EXPORT_CUSTOMER_RECORDS",
      },
    });
    const files = new Map<string, { storageKey: string; filename: string }>();
    function collect(v: unknown) {
      if (!v || typeof v !== "object") return;
      if (
        "storageKey" in v &&
        "filename" in v &&
        typeof v.storageKey === "string" &&
        typeof v.filename === "string"
      )
        files.set(v.storageKey, {
          storageKey: v.storageKey,
          filename: v.filename,
        });
      for (const item of Object.values(v)) collect(item);
    }
    const relatedDocuments = await db.document.findMany({
      where: {
        organizationId: a.organizationId,
        versions: {
          some: { snapshot: { path: ["customer", "id"], equals: id } },
        },
      },
      include: {
        versions: {
          include: { signatures: true, consents: true, pdfFile: true },
        },
      },
    });
    collect(customer);
    collect(relatedDocuments);
    const archive = new ZipArchive({ zlib: { level: 6 } });
    const stream = Readable.toWeb(archive) as ReadableStream<Uint8Array>;
    void (async () => {
      try {
        archive.append(
          JSON.stringify(
            {
              exportedAt: new Date().toISOString(),
              customer,
              relatedDocuments,
            },
            null,
            2,
          ),
          { name: "customer-records.json" },
        );
        for (const [key, file] of files)
          archive.append(
            Readable.fromWeb(
              (await openStored(
                key,
              )) as import("node:stream/web").ReadableStream,
            ),
            {
              name: `files/${key}-${file.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
            },
          );
        await archive.finalize();
      } catch (e) {
        archive.destroy(e instanceof Error ? e : new Error("Export failed"));
      }
    })();
    return new Response(stream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="customer-records-${id}.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  try {
    sameOrigin(req);
    const a = await actor();
    admin(a);
    const { id, action } = await params;
    if (action !== "archive") throw new HttpError(404, "Not found.");
    const { reason } = z
      .object({ reason: z.string().trim().min(1).max(2000) })
      .strict()
      .parse(await readJson(req, 3000));
    const row = await db.customer.findFirst({
      where: { id, organizationId: a.organizationId, deletedAt: null },
    });
    if (!row) throw new HttpError(404, "Customer not found.");
    await db.$transaction([
      db.customer.update({ where: { id }, data: { deletedAt: new Date() } }),
      db.documentShareToken.updateMany({
        where: {
          document: {
            organizationId: a.organizationId,
            versions: {
              some: { snapshot: { path: ["customer", "id"], equals: id } },
            },
          },
        },
        data: { revokedAt: new Date() },
      }),
      db.auditLog.create({
        data: {
          organizationId: a.organizationId,
          userId: a.id,
          entity: "Customer",
          entityId: id,
          action: "PRIVACY_ARCHIVE",
          after: { reason },
        },
      }),
    ]);
    return Response.json({
      message:
        "Customer archived and active share links revoked. Retained documents and signing records are preserved under the retention procedure.",
    });
  } catch (e) {
    return failure(e);
  }
}
