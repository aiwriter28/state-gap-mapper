// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import golden from "./fixtures/project-v1.json";
import { FileActions } from "../src/components/FileActions";
import { SpecPane } from "../src/components/SpecPane";
import { appStore } from "../src/store";

function resetStore() {
  appStore.setState({
    draftSpec: "",
    activeSpec: "",
    sentences: [],
    machine: null,
    gaps: { missingTransitions: [], unreachableStateIds: [], deadEndStateIds: [] },
    ranks: [],
    suggestedEvents: [],
    displayHoles: [],
    rankTruncated: false,
    stubs: [],
    dismissedPairKeys: new Set(),
    acceptedSuggestedEventIds: new Map(),
    selectedHoleKey: null,
    highlightedEvidence: [],
    viabilityRefusal: null,
    phase: "idle",
    error: null,
    rankError: null,
    rankPending: false,
    dirty: false,
    commandError: null,
    replacementConfirmation: null,
    replacementIntent: null,
    editorOpen: false,
  });
}

beforeEach(() => resetStore());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("Spec import is exact, local, opens the editor, and reports supported formats", async () => {
  const user = userEvent.setup();
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  render(<><FileActions /><SpecPane /></>);

  const input = screen.getByLabelText("Choose a Spec or State Gap Mapper project file");
  await user.upload(input, new File(["First\r\nSecond"], "behavior.MD", { type: "text/markdown" }));

  expect(appStore.getState()).toMatchObject({ draftSpec: "First\r\nSecond", editorOpen: true, machine: null });
  expect((screen.getByRole("textbox", { name: "Behavioral Spec" }) as HTMLTextAreaElement).value).toBe("First\nSecond");
  expect(screen.getByRole("status").textContent).toContain("Imported behavior.MD. Review the Spec, then map it.");
  const descriptionId = screen.getByRole("button", { name: "Import" }).getAttribute("aria-describedby");
  expect(document.getElementById(descriptionId ?? "")?.textContent).toMatch(/\.txt.*\.md.*\.markdown.*\.json/);
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
});

test("a newer import supersedes a slow read and stale completion cannot replace it", async () => {
  const user = userEvent.setup();
  render(<FileActions />);
  const input = screen.getByLabelText("Choose a Spec or State Gap Mapper project file");
  const importButton = screen.getByRole("button", { name: "Import" });
  let resolveSlow!: (value: ArrayBuffer) => void;
  const slowBytes = new Promise<ArrayBuffer>((resolve) => { resolveSlow = resolve; });
  const slow = new File(["Slow"], "slow.txt");
  Object.defineProperty(slow, "arrayBuffer", { value: () => slowBytes });

  await user.click(importButton);
  fireEvent.change(input, { target: { files: [slow] } });
  await user.click(importButton);
  fireEvent.change(input, { target: { files: [new File(["Fast"], "fast.txt")] } });
  await waitFor(() => expect(appStore.getState().draftSpec).toBe("Fast"));

  resolveSlow(new TextEncoder().encode("Slow").buffer);
  await Promise.resolve();
  await Promise.resolve();
  expect(appStore.getState().draftSpec).toBe("Fast");
  expect(screen.getByRole("status").textContent).toContain("Imported fast.txt");
});

test("replacement confirmation appears only after validation and cancel preserves the draft", async () => {
  const user = userEvent.setup();
  appStore.setState({ activeSpec: "Mapped", draftSpec: "Unsaved", editorOpen: true });
  render(<FileActions />);
  const input = screen.getByLabelText("Choose a Spec or State Gap Mapper project file");

  await user.upload(input, new File(["Replacement"], "next.txt"));
  expect(screen.getByRole("dialog").textContent).toContain("Importing will replace your current Spec draft. Continue?");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(appStore.getState().draftSpec).toBe("Unsaved");

  await user.upload(input, new File(["Replacement"], "next.txt"));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(appStore.getState().draftSpec).toBe("Replacement");
});

test("project restore and both exports are keyboard-operable and local", async () => {
  const user = userEvent.setup();
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:download");
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  const downloads: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
  render(<FileActions />);
  const input = screen.getByLabelText("Choose a Spec or State Gap Mapper project file");
  await user.upload(input, new File([JSON.stringify(golden)], "saved.json", { type: "application/json" }));
  expect(appStore.getState().activeSpec).toBe("A new order starts in Cart.");
  expect(screen.getByRole("status").textContent).toContain("Opened saved.json.");

  const exportButton = screen.getByRole("button", { name: "Export" });
  await user.click(exportButton);
  const reportButton = screen.getByRole("button", { name: "Download report (.md)" });
  expect(document.activeElement).toBe(reportButton);
  await user.click(reportButton);
  await user.click(screen.getByRole("button", { name: "Download project (.json)" }));

  expect(downloads[0]).toMatch(/^state-gap-mapper-report-\d{8}-\d{6}Z\.md$/);
  expect(downloads[1]).toMatch(/^state-gap-mapper-project-\d{8}-\d{6}Z\.json$/);
  expect((createObjectURL.mock.calls[0]![0] as Blob).type).toBe("text/markdown;charset=utf-8");
  expect((createObjectURL.mock.calls[1]![0] as Blob).type).toBe("application/json;charset=utf-8");
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
});
