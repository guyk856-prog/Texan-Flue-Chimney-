import { describe, it, expect, vi, afterEach } from "vitest";
const cloud = vi.hoisted(() => new Map<string, Uint8Array>());
vi.mock("@vercel/blob", () => ({
  put: vi.fn(
    async (
      key: string,
      bytes: Uint8Array,
      options: { access: string; allowOverwrite: boolean },
    ) => {
      if (options.access !== "private" || options.allowOverwrite !== false)
        throw new Error("Unsafe storage options");
      if (cloud.has(key)) throw new Error("Existing object");
      cloud.set(key, new Uint8Array(bytes));
    },
  ),
  get: vi.fn(async (key: string, options: { access: string }) => {
    if (options.access !== "private") throw new Error("Unsafe read");
    const bytes = cloud.get(key);
    return bytes
      ? {
          statusCode: 200,
          stream: new ReadableStream({
            start(c) {
              c.enqueue(bytes);
              c.close();
            },
          }),
        }
      : null;
  }),
  del: vi.fn(async (key: string) => {
    cloud.delete(key);
  }),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  cloud.clear();
});
describe("private object adapter contract (mocked provider, no live store)", () => {
  it("writes immutable private objects and streams them after an application module reload", async () => {
    vi.stubEnv("STORAGE_DRIVER", "vercel-blob");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "DEMO_ONLY_NOT_A_REAL_STORE_TOKEN");
    let adapter = await import("../../src/lib/storage");
    await adapter.storeBytes(
      "DEMO_private_object",
      Buffer.from("private evidence"),
      "application/pdf",
    );
    await expect(
      adapter.storeBytes("DEMO_private_object", Buffer.from("replacement")),
    ).rejects.toThrow();
    vi.resetModules();
    adapter = await import("../../src/lib/storage");
    expect((await adapter.readStored("DEMO_private_object")).toString()).toBe(
      "private evidence",
    );
    await adapter.removeStored("DEMO_private_object");
    await expect(adapter.openStored("DEMO_private_object")).rejects.toThrow(
      "File not found",
    );
  });
  it("rejects traversal and bounded reads larger than authorized", async () => {
    vi.stubEnv("STORAGE_DRIVER", "vercel-blob");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "DEMO_ONLY");
    const adapter = await import("../../src/lib/storage");
    await expect(adapter.openStored("../public/secrets")).rejects.toThrow();
    await adapter.storeBytes("DEMO_big_object", Buffer.alloc(5));
    await expect(adapter.readStored("DEMO_big_object", 4)).rejects.toThrow(
      "exceeds",
    );
  });
  it("refuses hosted ephemeral filesystem fallback", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("STORAGE_DRIVER", "filesystem");
    const { storageDirectory } = await import("../../src/lib/storage");
    expect(() => storageDirectory()).toThrow(
      "Persistent private object storage",
    );
  });
});
