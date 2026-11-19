import { createHash } from "node:crypto";
import { beforeEach, describe, expect, test } from "vitest";
import { MemoryVfs } from "../vfs";
import { FakeIntegrationProvider } from "./fake";
import type {
  ActionDescription,
  FileUploadRequest,
  FileUploadSlot,
} from "./file-args";
import {
  createFileStager,
  FileArgumentError,
  MAX_FILE_ARG_BYTES,
} from "./file-staging";
import { workspaceFileReader } from "./workspace-file";

// The live shapes (Composio GET /api/v3/tools, 2026-11-18): Gmail takes one
// file or a list, Drive exactly one.
const FILE_UPLOADABLE = {
  type: "object",
  title: "FileUploadable",
  file_uploadable: true,
  required: ["name", "mimetype", "s3key"],
  properties: {
    name: { type: "string" },
    mimetype: { type: "string" },
    s3key: { type: "string" },
  },
};
const SCHEMAS: Record<string, ActionDescription> = {
  GMAIL_CREATE_EMAIL_DRAFT: {
    action: "GMAIL_CREATE_EMAIL_DRAFT",
    toolkit: "gmail",
    inputParams: {
      type: "object",
      properties: {
        recipient_email: { type: "string" },
        body: { type: "string" },
        attachment: {
          anyOf: [
            FILE_UPLOADABLE,
            { type: "array", items: FILE_UPLOADABLE },
            { type: "null" },
          ],
        },
      },
    },
  },
  GOOGLEDRIVE_UPLOAD_FILE: {
    action: "GOOGLEDRIVE_UPLOAD_FILE",
    toolkit: "googledrive",
    inputParams: {
      type: "object",
      properties: { file_to_upload: FILE_UPLOADABLE, folder_to_upload_to: {} },
      required: ["file_to_upload"],
    },
  },
  GMAIL_SEND_EMAIL: {
    action: "GMAIL_SEND_EMAIL",
    toolkit: "gmail",
    inputParams: { type: "object", properties: { to: { type: "string" } } },
  },
};

class FileProvider extends FakeIntegrationProvider {
  describes: string[] = [];
  reserves: FileUploadRequest[] = [];
  async describeAction(_userId: string, action: string) {
    this.describes.push(action);
    return SCHEMAS[action] ?? null;
  }
  async reserveFileUpload(
    _userId: string,
    req: FileUploadRequest,
  ): Promise<FileUploadSlot> {
    this.reserves.push(req);
    return {
      key: `projects/p/requests/${req.toolkit}/${req.filename}`,
      uploadUrl: `https://storage.example/${req.filename}`,
      headers: { "Content-Type": req.mimetype },
    };
  }
}

const AGENT_ROOT = "Personal/CMO";
const PDF = Buffer.from("%PDF-1.7 quarterly");

let vfs: MemoryVfs;
let provider: FileProvider;
let puts: { url: string; headers: unknown; body: Buffer }[];
let stage: ReturnType<typeof createFileStager>;

beforeEach(async () => {
  vfs = new MemoryVfs();
  await vfs.writeBytes(`${AGENT_ROOT}/reports/q3.pdf`, PDF);
  await vfs.writeBytes(`${AGENT_ROOT}/notes.txt`, Buffer.from("hi"));
  provider = new FileProvider();
  puts = [];
  stage = createFileStager((async (url, init) => {
    puts.push({
      url: String(url),
      headers: init?.headers,
      body: Buffer.from(init?.body as Uint8Array),
    });
    return new Response(null, { status: 200 });
  }) as typeof fetch);
});

const run = (action: string, params: Record<string, unknown>) =>
  stage({
    provider,
    userId: "u1",
    action,
    params,
    readFile: workspaceFileReader(vfs, AGENT_ROOT),
  });

describe("file staging", () => {
  test("Gmail draft: a workspace path becomes an uploaded attachment", async () => {
    const params = await run("GMAIL_CREATE_EMAIL_DRAFT", {
      recipient_email: "someone@example.com",
      body: "Attached.",
      attachment: "reports/q3.pdf",
    });
    expect(params).toEqual({
      recipient_email: "someone@example.com",
      body: "Attached.",
      attachment: {
        name: "q3.pdf",
        mimetype: "application/pdf",
        s3key: "projects/p/requests/gmail/q3.pdf",
      },
    });
    expect(provider.reserves).toEqual([
      {
        action: "GMAIL_CREATE_EMAIL_DRAFT",
        toolkit: "gmail",
        filename: "q3.pdf",
        mimetype: "application/pdf",
        md5: createHash("md5").update(PDF).digest("hex"),
      },
    ]);
    expect(puts).toEqual([
      {
        url: "https://storage.example/q3.pdf",
        headers: { "Content-Type": "application/pdf" },
        body: PDF,
      },
    ]);
  });

  test("Gmail draft: a list of paths uploads each file", async () => {
    const params = await run("GMAIL_CREATE_EMAIL_DRAFT", {
      attachment: ["reports/q3.pdf", "./notes.txt"],
    });
    expect(params.attachment).toEqual([
      {
        name: "q3.pdf",
        mimetype: "application/pdf",
        s3key: "projects/p/requests/gmail/q3.pdf",
      },
      {
        name: "notes.txt",
        mimetype: "text/plain",
        s3key: "projects/p/requests/gmail/notes.txt",
      },
    ]);
  });

  test("Drive upload: the {s3key: <absolute path>} shape agents copy is staged too", async () => {
    const params = await run("GOOGLEDRIVE_UPLOAD_FILE", {
      file_to_upload: {
        name: "Q3 report.pdf",
        mimetype: "application/pdf",
        s3key: `/work/houston-turn-1/store/workspaces/${AGENT_ROOT}/reports/q3.pdf`,
      },
      folder_to_upload_to: "folder-1",
    });
    expect(params).toEqual({
      file_to_upload: {
        name: "Q3 report.pdf",
        mimetype: "application/pdf",
        s3key: "projects/p/requests/googledrive/Q3 report.pdf",
      },
      folder_to_upload_to: "folder-1",
    });
    expect(puts[0]?.body).toEqual(PDF);
  });

  test("a real Composio key with no workspace file behind it is forwarded untouched", async () => {
    const attachment = {
      name: "invoice.pdf",
      mimetype: "application/pdf",
      s3key: "47563/gmail/GET_ATTACHMENT/response/12345",
    };
    const params = await run("GMAIL_CREATE_EMAIL_DRAFT", { attachment });
    expect(params.attachment).toEqual(attachment);
    expect(provider.reserves).toEqual([]);
  });

  test("an absolute s3key with no file behind it gets the same guidance", async () => {
    await expect(
      run("GOOGLEDRIVE_UPLOAD_FILE", {
        file_to_upload: { name: "a.pdf", mimetype: "x", s3key: "/tmp/a.pdf" },
      }),
    ).rejects.toThrow(/outside your workspace/);
  });

  test("a missing file fails with guidance and uploads nothing", async () => {
    const failure = run("GOOGLEDRIVE_UPLOAD_FILE", {
      file_to_upload: "reports/q4.pdf",
    });
    await expect(failure).rejects.toBeInstanceOf(FileArgumentError);
    await expect(failure).rejects.toThrow(/was not found in your workspace/);
    expect(puts).toEqual([]);
  });

  test("a path outside the workspace is refused", async () => {
    await expect(
      run("GOOGLEDRIVE_UPLOAD_FILE", { file_to_upload: "/etc/hosts" }),
    ).rejects.toThrow(/outside your workspace/);
    await expect(
      run("GOOGLEDRIVE_UPLOAD_FILE", { file_to_upload: "../Other/a.pdf" }),
    ).rejects.toThrow(/outside your workspace/);
  });

  test("an oversize file is refused before any upload", async () => {
    await vfs.writeBytes(
      `${AGENT_ROOT}/big.bin`,
      Buffer.alloc(MAX_FILE_ARG_BYTES + 1),
    );
    await expect(
      run("GOOGLEDRIVE_UPLOAD_FILE", { file_to_upload: "big.bin" }),
    ).rejects.toThrow(/larger than 50 MB/);
    expect(provider.reserves).toEqual([]);
  });

  test("non-file args, and actions without file args, pass through untouched", async () => {
    const params = { to: "reports/q3.pdf" };
    expect(await run("GMAIL_SEND_EMAIL", params)).toBe(params);
    const draft = await run("GMAIL_CREATE_EMAIL_DRAFT", {
      recipient_email: "reports/q3.pdf",
      body: "notes.txt",
    });
    expect(draft).toEqual({
      recipient_email: "reports/q3.pdf",
      body: "notes.txt",
    });
    expect(provider.reserves).toEqual([]);
  });

  test("the action schema is looked up once per action", async () => {
    await run("GMAIL_SEND_EMAIL", {});
    await run("GMAIL_SEND_EMAIL", {});
    await run("GOOGLEDRIVE_UPLOAD_FILE", { file_to_upload: "notes.txt" });
    await run("GOOGLEDRIVE_UPLOAD_FILE", { file_to_upload: "notes.txt" });
    expect(provider.describes).toEqual([
      "GMAIL_SEND_EMAIL",
      "GOOGLEDRIVE_UPLOAD_FILE",
    ]);
  });

  test("a provider without the file leg executes params as given", async () => {
    const plain = new FakeIntegrationProvider();
    const params = { file_to_upload: "reports/q3.pdf" };
    const staged = await stage({
      provider: plain,
      userId: "u1",
      action: "GOOGLEDRIVE_UPLOAD_FILE",
      params,
      readFile: workspaceFileReader(vfs, AGENT_ROOT),
    });
    expect(staged).toBe(params);
  });

  test("a failed upload PUT surfaces as an error", async () => {
    const failing = createFileStager(
      (async () =>
        new Response("denied", { status: 403 })) as unknown as typeof fetch,
    );
    await expect(
      failing({
        provider,
        userId: "u1",
        action: "GOOGLEDRIVE_UPLOAD_FILE",
        params: { file_to_upload: "notes.txt" },
        readFile: workspaceFileReader(vfs, AGENT_ROOT),
      }),
    ).rejects.toThrow(/HTTP 403/);
  });
});

test("a pathologically deep schema is walked within a bound", async () => {
  let nested: unknown = { type: "string" };
  for (let i = 0; i < 5000; i++) nested = { anyOf: [nested] };
  const { hasFileArgs, mapFileArgs } = await import("./file-args");
  expect(hasFileArgs({ properties: { nested } })).toBe(false);
  const params = { nested: "x" };
  expect(
    await mapFileArgs(params, { properties: { nested } }, async (v) => v),
  ).toEqual(params);
});
