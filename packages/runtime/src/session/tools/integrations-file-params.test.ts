import { describe, expect, it } from "vitest";
import { FILE_PARAM_NOTE, presentFileParams } from "./integrations-file-params";
import { renderSearchItems, schemaSignature } from "./integrations-render";

const FILE_UPLOADABLE = {
  type: "object",
  title: "FileUploadable",
  file_uploadable: true,
  required: ["name", "mimetype", "s3key"],
  properties: {
    name: { type: "string" },
    mimetype: { type: "string" },
    s3key: {
      type: "string",
      description: "The S3 key of a publicly accessible file",
    },
  },
};

const gmailDraft = {
  type: "object",
  properties: {
    recipient_email: { type: "string" },
    attachment: {
      description: "File to attach.",
      anyOf: [FILE_UPLOADABLE, { type: "array", items: FILE_UPLOADABLE }],
    },
  },
};

describe("file arguments", () => {
  it("rewrites every file node to a path string, leaving the rest alone", () => {
    const { schema, hasFiles } = presentFileParams(gmailDraft);
    expect(hasFiles).toBe(true);
    const text = JSON.stringify(schema);
    expect(text).not.toContain("s3key");
    expect(text).toContain('"recipient_email":{"type":"string"}');
    expect(text).toContain('"description":"File to attach."');
  });

  it("keeps a schema without files as the same object", () => {
    const plain = { properties: { to: { type: "string" } } };
    expect(presentFileParams(plain)).toEqual({
      schema: plain,
      hasFiles: false,
    });
  });

  it("types a file argument as file-path in signatures", () => {
    expect(schemaSignature(presentFileParams(gmailDraft).schema)).toBe(
      "{ recipient_email?: string, attachment?: file-path|file-path[] }",
    );
  });

  it("leads a search result showing a file argument with the path contract", () => {
    const text = renderSearchItems([
      {
        action: "GOOGLEDRIVE_UPLOAD_FILE",
        toolkit: "googledrive",
        description: "Upload a file",
        inputParams: {
          type: "object",
          properties: { file_to_upload: FILE_UPLOADABLE },
          required: ["file_to_upload"],
        },
        status: "connected",
      },
    ]);
    expect(text.startsWith(FILE_PARAM_NOTE)).toBe(true);
    expect(text).not.toContain('s3key":{');
    expect(text).toContain("Path of a file in your workspace");
  });

  it("adds no note when no action takes a file", () => {
    const text = renderSearchItems([
      {
        action: "GMAIL_SEND_EMAIL",
        toolkit: "gmail",
        description: "Send",
        inputParams: { properties: { to: { type: "string" } } },
        status: "connected",
      },
    ]);
    expect(text).not.toContain(FILE_PARAM_NOTE);
  });
});
