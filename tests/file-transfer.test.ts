// @vitest-environment jsdom

import { describe, expect, test, vi } from "vitest";

import {
  FileTransferError,
  PROJECT_FILE_BYTES,
  readImportFile,
  triggerDownload,
} from "../src/fileTransfer";

describe("file transfer adapter", () => {
  test("imports exact UTF-8 Spec source, removes one BOM, and routes case-insensitively", async () => {
    const file = new File([new Uint8Array([0xef, 0xbb, 0xbf]), "A\r\nB"], "SPEC.MARKDOWN");
    await expect(readImportFile(file)).resolves.toEqual({
      kind: "spec",
      filename: "SPEC.MARKDOWN",
      text: "A\r\nB",
    });
  });

  test("rejects unsupported, invalid UTF-8, empty, oversized text, and oversized JSON", async () => {
    await expect(readImportFile(new File(["x"], "spec.yaml"))).rejects.toMatchObject({ code: "unsupported_extension" });
    await expect(readImportFile(new File([new Uint8Array([0xc3, 0x28])], "spec.txt"))).rejects.toMatchObject({ code: "invalid_utf8" });
    await expect(readImportFile(new File([" \n"], "spec.md"))).rejects.toMatchObject({ code: "empty_spec" });
    await expect(readImportFile(new File(["x".repeat(4_001)], "spec.txt"))).rejects.toMatchObject({ code: "spec_too_long" });
    const tooLarge = new File([new Uint8Array(PROJECT_FILE_BYTES + 1)], "project.json");
    await expect(readImportFile(tooLarge)).rejects.toMatchObject({ code: "project_too_large" });
  });

  test("download uses the exact MIME type, attached anchor, and delayed revocation", () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:test");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(document.body.contains(this)).toBe(true);
    });

    triggerDownload("hello\n", "report.md", "text/markdown;charset=utf-8");

    const blob = createObjectURL.mock.calls[0]![0];
    expect(blob.type).toBe("text/markdown;charset=utf-8");
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
    vi.useRealTimers();
  });

  test("normalizes browser read failures without leaking exception text", async () => {
    const file = new File(["valid"], "spec.txt");
    Object.defineProperty(file, "arrayBuffer", { value: vi.fn().mockRejectedValue(new Error("secret path")) });
    await expect(readImportFile(file)).rejects.toEqual(new FileTransferError("read_failed"));
  });
});
