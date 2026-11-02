import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { HttpError } from "../errors";
import { validateFile } from "../files";
import type { AIContent } from "./provider";
const exec = promisify(execFile);
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
        "Image could not be decoded or exceeds the 40 megapixel limit. Use a valid PNG, JPEG or WebP.",
      );
    }
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), "texan-ai-"));
  const input = path.join(dir, "input.pdf");
  try {
    await writeFile(input, b, { mode: 0o600 });
    const opts = { timeout: 15000, maxBuffer: 2000000 };
    const info = (await exec("pdfinfo", [input], opts)).stdout;
    const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
    if (
      !Number.isInteger(pages) ||
      pages < 1 ||
      pages > 5 ||
      /Encrypted:\s+yes/.test(info)
    )
      throw new HttpError(400, "Use an unencrypted PDF of at most 5 pages.");
    const content: AIContent[] = [];
    for (let n = 1; n <= pages; n++) {
      const text = (
        await exec(
          "pdftotext",
          ["-f", String(n), "-l", String(n), "-layout", input, "-"],
          opts,
        )
      ).stdout.trim();
      if (text) {
        if (text.length > 24000)
          throw new HttpError(400, "PDF text exceeds the per-page limit.");
        content.push({ type: "text", text: `Page ${n} text layer:\n${text}` });
      } else {
        const base = path.join(dir, "page");
        await exec(
          "pdftoppm",
          [
            "-f",
            String(n),
            "-l",
            String(n),
            "-singlefile",
            "-scale-to",
            "1800",
            "-png",
            input,
            base,
          ],
          opts,
        );
        content.push(
          { type: "text", text: `Page ${n} has no text layer; image follows.` },
          await image(await readFile(base + ".png")),
        );
      }
    }
    return content;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(
      400,
      "PDF could not be read. Use an unencrypted PDF of at most 5 pages.",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
