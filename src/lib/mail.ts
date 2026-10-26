import nodemailer from "nodemailer";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { newToken } from "./security";
export async function sendReset(to: string, url: string) {
  const message = {
    to,
    subject: "Reset your Texan Flue password",
    text: `Use this single-use link within 30 minutes: ${url}`,
  };
  if (
    process.env.MAIL_MODE === "capture" &&
    process.env.NODE_ENV !== "production"
  ) {
    const directory = path.resolve(
      /* turbopackIgnore: true */ process.env.MAIL_CAPTURE_DIR ??
        "./private/mail",
    );
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(
      path.join(
        /* turbopackIgnore: true */ directory,
        `${Date.now()}-${newToken()}.json`,
      ),
      JSON.stringify(message),
      { mode: 0o600 },
    );
    return;
  }
  if (
    process.env.MAIL_MODE !== "smtp" ||
    !process.env.SMTP_URL ||
    !process.env.MAIL_FROM
  )
    throw new Error("SMTP is not configured");
  await nodemailer
    .createTransport(process.env.SMTP_URL)
    .sendMail({ ...message, from: process.env.MAIL_FROM });
}
