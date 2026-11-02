import sharp from "sharp";
import { HttpError } from "../errors";
import { validateFile } from "../files";
import type { AIContent } from "./provider";
import path from "node:path";
export async function sourceContent(file: File): Promise<AIContent[]> {
  const b = Buffer.from(await file.arrayBuffer());
  validateFile(file.name, file.type, b.length, b);
  const image = async (bytes: Buffer): Promise<AIContent> => ({
    type: "image",
    source: {
      type: "base64",
      media_type: "image/png",
      data: (
        await sharp(bytes, { limitInputPixels: 40000000 })
          .rotate()
          .resize({
            width: 1800,
            height: 1800,
            fit: "inside",
            withoutEnlargement: true,
          })
          .png()
          .toBuffer()
      ).toString("base64"),
    },
  });
  if (file.type !== "application/pdf") {
    try {
      return [await image(b)];
    } catch {
      throw new HttpError(
        400,
        "Image cannot be decoded or exceeds the 40 megapixel limit. Select a valid PNG, JPEG or WebP.",
      );
    }
  }
  let pdf;
  let loading;
  try {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { createCanvas } = await import("@napi-rs/canvas");
    loading = getDocument({
      data: new Uint8Array(b),
      useSystemFonts: false,
      standardFontDataUrl: path.join(
        /* turbopackIgnore: true */ process.cwd(),
        "node_modules/pdfjs-dist/standard_fonts/",
      ),
      wasmUrl: path.join(
        /* turbopackIgnore: true */ process.cwd(),
        "node_modules/pdfjs-dist/wasm/",
      ),
    });
    pdf = await loading.promise;
    if (pdf.numPages < 1 || pdf.numPages > 5)
      throw new HttpError(400, "Use an unencrypted PDF of at most 5 pages.");
    const content: AIContent[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const tokens = await page.getTextContent();
      const text = tokens.items
        .map((v) =>
          "str" in v ? v.str + ("hasEOL" in v && v.hasEOL ? "\n" : " ") : "",
        )
        .join("")
        .trim();
      if (text) {
        if (text.length > 24000)
          throw new HttpError(
            400,
            "PDF text exceeds the per-page limit. Split the document.",
          );
        content.push({ type: "text", text: `Page ${n} text layer:\n${text}` });
      } else {
        const original = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({
          scale: Math.min(1800 / original.width, 1800 / original.height),
        });
        const canvas = createCanvas(
          Math.ceil(viewport.width),
          Math.ceil(viewport.height),
        );
        await page.render({
          canvas: canvas as unknown as HTMLCanvasElement,
          canvasContext: canvas.getContext(
            "2d",
          ) as unknown as CanvasRenderingContext2D,
          viewport,
        }).promise;
        content.push(
          { type: "text", text: `Page ${n} has no text layer; image follows.` },
          await image(canvas.toBuffer("image/png")),
        );
      }
      page.cleanup();
    }
    return content;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(
      400,
      "PDF cannot be read. Use an unencrypted PDF of at most 5 pages.",
    );
  } finally {
    await loading?.destroy();
  }
}
