const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const baseUrl = "http://127.0.0.1:8876/state-gap-mapper.html";
const outputDir = path.resolve(__dirname, "verification");
fs.mkdirSync(outputDir, { recursive: true });

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function captureSection(page, selector, name) {
  await page.locator(selector).screenshot({ path: path.join(outputDir, name) });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const results = [];

  try {
    const context = await browser.newContext({
      viewport: { width: 1536, height: 1024 },
      deviceScaleFactor: 2,
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);

    const rasterAssets = await page.evaluate(() =>
      Array.from(document.images).map((image) => ({
        src: image.currentSrc,
        intrinsic: [image.naturalWidth, image.naturalHeight],
        rendered: [image.getBoundingClientRect().width, image.getBoundingClientRect().height],
      })),
    );
    invariant(rasterAssets.length === 0, "Prototype unexpectedly contains raster UI assets");
    results.push({ check: "raster-assets", status: "pass", detail: "No raster assets; all UI is live DOM/SVG." });

    const shellGeometry = await page.evaluate(() => {
      const shell = document.querySelector(".app-shell").getBoundingClientRect();
      const panes = Array.from(document.querySelectorAll(".pane")).map((pane) => {
        const rect = pane.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      });
      return { shell: { width: shell.width, height: shell.height }, panes, viewport: [innerWidth, innerHeight] };
    });
    invariant(shellGeometry.shell.width === 1536 && shellGeometry.shell.height === 1024, "Shell does not fill the target viewport");
    invariant(shellGeometry.panes.every((pane) => pane.left >= 0 && pane.right <= 1536 && pane.top >= 56 && pane.bottom <= 846), "A pane overflows the 1536px target shell");
    results.push({ check: "1536-shell-geometry", status: "pass", detail: shellGeometry });

    await page.screenshot({ path: path.join(outputDir, "desktop-1536-mid.png"), fullPage: true });
    await captureSection(page, '[data-section="spec"]', "section-spec.png");
    await captureSection(page, '[data-section="canvas"]', "section-canvas.png");
    await captureSection(page, '[data-section="gaps"]', "section-gaps.png");
    await captureSection(page, '[data-section="stubs"]', "section-stubs.png");

    await page.locator("#flagshipCard").click({ position: { x: 30, y: 30 } });
    invariant((await page.locator(".sentence.selected").count()) === 2, "Gap selection did not highlight exactly two evidence sentences");
    invariant(await page.locator("#graph").evaluate((node) => node.classList.contains("selected-gap")), "Gap selection did not make the ghost solid");
    await page.screenshot({ path: path.join(outputDir, "desktop-1536-selected.png"), fullPage: true });

    await page.locator("#acceptButton").click();
    invariant(await page.locator("#acceptDialog").evaluate((dialog) => dialog.open), "Accept dialog did not open");
    await captureSection(page, "#acceptDialog", "overlay-accept-picker.png");
    await page.locator("#confirmAcceptButton").click();
    invariant(await page.locator("#graph").evaluate((node) => node.classList.contains("accepted")), "Accepted graph state was not applied");
    invariant((await page.locator("#gapHeadingText").textContent()) === "Gaps (9)", "Accept did not decrement the gap count");
    invariant((await page.locator("#stubThen").textContent()).includes("Cancelled"), "Accept did not finalize the Test Stub");
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(outputDir, "desktop-1536-accepted.png"), fullPage: true });

    await page.locator("#matrixButton").click();
    invariant(await page.locator("#matrixDialog").evaluate((dialog) => dialog.open), "Matrix dialog did not open");
    await captureSection(page, "#matrixDialog", "overlay-matrix.png");
    await page.locator("#matrixDialog .dialog-button.primary").click();

    await page.locator("#copyButton").click();
    await page.waitForFunction(() => ["Copied", "Copy failed"].includes(document.getElementById("copyButton").textContent.trim()));
    invariant(["Copied", "Copy failed"].includes((await page.locator("#copyButton").textContent()).trim()), "Copy control did not provide visible feedback");

    await page.locator("#docsButton").click();
    await page.locator('[data-prototype-state="mid"]').click();
    await page.locator("#dismissButton").click();
    invariant(await page.locator("#dismissedRow").isVisible(), "Dismiss did not expose an undo path");
    invariant((await page.locator("#matrixFlagship").textContent()) === "dismissed", "Dismiss was not reflected in the matrix");
    await page.locator("#undoDismissButton").click();
    invariant(await page.locator("#flagshipCard").isVisible(), "Undo did not restore the flagship card");

    await page.locator("#suggestButton").click();
    invariant((await page.locator("#gapHeadingText").textContent()) === "Gaps (15)", "Suggested Event did not show the structural-gap cascade");

    const beforeCollapse = await page.locator("#stubsDrawer").boundingBox();
    await page.locator("#stubToggle").click();
    invariant((await page.locator("#stubToggle").getAttribute("aria-expanded")) === "false", "Test Stub drawer did not collapse");
    const afterCollapse = await page.locator("#stubsDrawer").boundingBox();
    invariant(beforeCollapse.height === afterCollapse.height, "Fixed shell drawer unexpectedly changed the viewport grid");
    await page.locator("#stubToggle").click();

    const focusSequence = [];
    await page.keyboard.press("Tab");
    for (let index = 0; index < 6; index += 1) {
      focusSequence.push(await page.evaluate(() => document.activeElement?.id || document.activeElement?.textContent?.trim().slice(0, 24)));
      await page.keyboard.press("Tab");
    }
    invariant(focusSequence.some(Boolean), "Keyboard traversal did not reach interactive controls");
    results.push({ check: "interaction-contract", status: "pass", detail: "Select, accept, dismiss/undo, matrix, suggestion cascade, copy feedback, drawer, and keyboard traversal verified." });

    await page.locator("#docsButton").click();
    await page.locator('[data-prototype-state="empty"]').click();
    invariant(await page.locator("#emptySpec").isVisible(), "Empty state was not displayed");
    invariant(await page.locator("#populatedSpec").isHidden(), "Populated Spec content leaked into the empty state");
    invariant(await page.locator("#canvasEmpty").isVisible(), "Canvas empty state was not displayed");
    invariant(await page.locator("#gapEmpty").isVisible(), "Gap empty state was not displayed");
    await page.locator("#specInput").fill("A new order starts in Cart.");
    invariant(!(await page.locator("#extractButton").isDisabled()), "Valid empty-state input did not enable the primary action");
    await page.screenshot({ path: path.join(outputDir, "desktop-1536-empty.png"), fullPage: true });

    await page.evaluate(() => setState("unranked"));
    invariant((await page.locator("#flagshipLabel").textContent()) === "UNRANKED", "Rank failure did not preserve the Structural Gap as Unranked");
    invariant(await page.locator("#rankingNote").isVisible(), "Unranked state did not explain the preserved hole set");
    await page.locator("#rerankButton").click();
    invariant((await page.locator("#rerankButton").textContent()).includes("Ranking"), "Re-rank did not expose a pending state");
    await page.waitForFunction(() => document.getElementById("rerankButton").textContent === "Re-rank");
    invariant((await page.locator("#flagshipLabel").textContent()) === "REDLINE", "Successful re-rank did not restore relevance metadata");
    await page.screenshot({ path: path.join(outputDir, "desktop-1536-unranked.png"), fullPage: true });

    await page.evaluate(() => setState("structural"));
    invariant(await page.locator("#structuralSections").isVisible(), "Unreachable and Dead-End sections are not represented");
    invariant((await page.locator("#structuralSections .structural-card").count()) === 2, "Both deterministic state-gap categories are not visible");
    await page.screenshot({ path: path.join(outputDir, "desktop-1536-structural.png"), fullPage: true });

    await page.evaluate(() => setState("coverage"));
    invariant(await page.locator('[data-sentence="6"]').evaluate((node) => node.classList.contains("uncovered")), "Coverage state did not gray the uncovered sentence");
    invariant((await page.locator('[data-sentence="6"]').getAttribute("title")) === "This sentence did not map to any state, event, or transition.", "Coverage state is missing the exact trust-layer explanation");
    invariant((await page.locator(".coverage").textContent()) === "5 of 6 sentences mapped", "Coverage count did not update");
    await page.screenshot({ path: path.join(outputDir, "desktop-1536-coverage.png"), fullPage: true });

    await page.evaluate(() => setState("loading"));
    invariant((await page.locator("#canvasStatusTitle").textContent()) === "Extracting your state machine", "Extraction pending state is missing");
    await page.screenshot({ path: path.join(outputDir, "desktop-1536-loading.png"), fullPage: true });
    await page.evaluate(() => setState("refusal"));
    invariant((await page.locator("#canvasStatusTitle").textContent()).includes("behavioral spec"), "Viability refusal state is missing");
    await page.screenshot({ path: path.join(outputDir, "desktop-1536-refusal.png"), fullPage: true });
    await page.evaluate(() => setState("error"));
    invariant(await page.locator("#retryButton").isVisible(), "Retryable API error has no Retry action");
    await page.screenshot({ path: path.join(outputDir, "desktop-1536-error.png"), fullPage: true });
    await page.locator("#retryButton").click();
    await page.waitForFunction(() => document.querySelector(".app-shell").dataset.state === "mid");

    await page.locator("#editSpecButton").click();
    invariant(await page.locator("#emptySpec").isVisible(), "Edit Spec did not return to the textarea");
    invariant((await page.locator("#specInput").inputValue()).includes("A new order starts"), "Edit Spec did not preserve the active Spec as the editable draft");
    await page.locator("#extractButton").click();
    invariant((await page.locator(".app-shell").getAttribute("data-state")) === "loading", "Map this spec did not enter the extraction phase");
    await page.waitForFunction(() => document.querySelector(".app-shell").dataset.state === "mid");

    await page.locator("#editMachineButton").click();
    invariant(await page.locator("#canvasInspector").isVisible(), "Machine inspector did not open");
    await captureSection(page, "#canvasInspector", "overlay-machine-inspector.png");
    await page.locator("#stateNameInput").fill("Payment processing");
    await page.locator("#saveStateButton").click();
    invariant((await page.locator("#processingLabel").textContent()) === "Payment processing", "State rename did not update the canvas");
    const fittedStateLabel = await page.locator("#processingLabel").getAttribute("textLength");
    invariant(fittedStateLabel !== null, "Long state names are not constrained inside their node");
    await page.locator("#makeInitialButton").click();
    invariant((await page.locator("#inspectorFeedback").textContent()).includes("setInitial"), "Make-initial control has no command feedback");
    await page.locator("#toggleFinalButton").click();
    invariant((await page.locator("#inspectorFeedback").textContent()).includes("Remove outgoing transitions"), "Invalid final-state mutation did not show validation feedback");
    await page.locator("#eventNameInput").fill("begin_checkout");
    await page.locator("#renameEventButton").click();
    invariant((await page.locator("#checkoutEventLabel").textContent()) === "begin_checkout", "Event rename did not update the canvas");
    await page.locator("#deleteStateButton").click();
    invariant((await page.locator("#inspectorFeedback").textContent()).includes("Prototype placeholder"), "Non-fixture state deletion has no documented placeholder response");

    await page.locator("#addStateButton").click();
    invariant(await page.locator("#addStateDialog").evaluate((dialog) => dialog.open), "Add-state dialog did not open");
    await captureSection(page, "#addStateDialog", "overlay-add-state.png");
    await page.locator("#addStateNameInput").fill("Manual review");
    await page.locator("#confirmAddStateButton").click();
    invariant(await page.locator("#graph").evaluate((node) => node.classList.contains("edited")), "New state did not update the graph");
    invariant((await page.locator("#gapHeadingText").textContent()) === "Gaps (17)", "New state did not synchronously update the deterministic gap count");
    invariant(await page.locator("#editGapCard").isVisible(), "New edit-created holes are not listed as Unranked");
    invariant(await page.locator("#structuralSections").isVisible(), "New unreachable/dead-end state categories did not appear");
    await page.locator("#toggleFinalButton").click();
    invariant(await page.locator("#graph").evaluate((node) => node.classList.contains("manual-final")), "Final-state toggle did not update the user-added node");
    await page.evaluate(() => openInspector("cart"));
    invariant((await page.locator("#deleteStateButton").getAttribute("title")).includes("initial state cannot be deleted"), "Initial-state delete is missing its blocking tooltip");
    await page.locator("#deleteStateButton").click();
    invariant((await page.locator("#inspectorFeedback").textContent()).includes("cannot be deleted"), "Initial-state delete was not visibly blocked");
    await page.locator("#closeInspectorButton").click();
    invariant(await page.locator("#canvasInspector").isHidden(), "Machine inspector did not close");
    await page.screenshot({ path: path.join(outputDir, "desktop-1536-canvas-edited.png"), fullPage: true });

    await page.locator("#editSpecButton").click();
    invariant(await page.locator("#dirtyDialog").evaluate((dialog) => dialog.open), "Dirty extraction replacement did not open the guard dialog");
    await page.locator('#dirtyDialog button[type="submit"]').click();

    await page.locator('[data-sample="order"]').first().click();
    invariant(await page.locator("#dirtyDialog").evaluate((dialog) => dialog.open), "Dirty cached-sample replacement did not open the guard dialog");
    await captureSection(page, "#dirtyDialog", "overlay-dirty-replacement.png");
    await page.locator("#confirmDirtyReplaceButton").click();
    invariant((await page.locator("#gapHeadingText").textContent()) === "Gaps (10)", "Confirmed replacement did not restore the cached sample");

    await page.locator("#editMachineButton").click();
    await page.locator("#deleteTransitionButton").click();
    invariant(await page.locator("#graph").evaluate((node) => node.classList.contains("edge-deleted")), "Deleting a transition did not update the canvas");
    invariant((await page.locator("#gapHeadingText").textContent()) === "Gaps (11)", "Deleting a transition did not add its Structural Gap");
    invariant((await page.locator("#matrixCartCheckout").textContent()) === "hole", "Transition deletion did not update the matrix");

    await page.locator("#addTransitionButton").click();
    invariant(await page.locator("#addTransitionDialog").evaluate((dialog) => dialog.open), "Event picker did not open");
    await captureSection(page, "#addTransitionDialog", "overlay-add-transition.png");
    await page.locator("#confirmAddTransitionButton").click();
    invariant(await page.locator("#graph").evaluate((node) => node.classList.contains("accepted")), "Validated transition did not render dynamically");
    invariant((await page.locator("#gapHeadingText").textContent()) === "Gaps (9)", "Added transition did not remove the flagship hole");

    await page.evaluate(() => setState("mid"));
    await page.locator("#acceptButton").click();
    await page.locator('[data-target="new"]').click();
    invariant(await page.locator("#confirmAcceptButton").isDisabled(), "New-state accept target can be confirmed while blank");
    await page.locator("#newTargetInput").fill("Refund requested");
    invariant(!(await page.locator("#confirmAcceptButton").isDisabled()), "Valid new target did not enable confirmation");
    await page.locator("#confirmAcceptButton").click();
    invariant((await page.locator("#manualNodeLabel").textContent()) === "refund_requested", "Accept-created state did not render with user provenance");
    invariant((await page.locator("#stubThen").textContent()).includes("Refund Requested"), "Accept-created state did not finalize the Test Stub");

    await page.evaluate(() => { setState("mid"); window.__forceCopyFailure = true; });
    await page.locator("#copyButton").click();
    await page.waitForFunction(() => document.getElementById("copyFeedback").textContent.length > 0);
    invariant((await page.locator("#copyFeedback").textContent()) === "Copy failed, select the text manually", "Clipboard failure does not show the exact recovery guidance");
    await page.evaluate(() => { window.__forceCopyFailure = false; });

    await page.locator("#gapPopulated").evaluate((node) => { node.scrollTop = node.scrollHeight; });
    await captureSection(page, '[data-section="gaps"]', "section-gaps-bottom-scroll.png");
    const gapScrollClearance = await page.locator("#gapPopulated").evaluate((node) => Math.abs(node.scrollHeight - node.clientHeight - node.scrollTop) <= 1);
    invariant(gapScrollClearance, "Gap panel cannot expose its final control at bottom scroll");
    results.push({ check: "full-plan-ui-contract", status: "pass", detail: "Extraction/refusal/error, ranking, structural categories, coverage, canvas commands, dirty guard, target creation, exact copy fallback, and bottom scroll verified." });

    const compactPage = await context.newPage();
    await compactPage.setViewportSize({ width: 1280, height: 800 });
    await compactPage.goto(baseUrl, { waitUntil: "networkidle" });
    await compactPage.evaluate(() => document.fonts.ready);
    const compactOverflow = await compactPage.evaluate(() => ({
      docWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      docHeight: document.documentElement.scrollHeight,
      viewportHeight: innerHeight,
    }));
    invariant(compactOverflow.docWidth === compactOverflow.viewportWidth, "1280px layout has horizontal overflow");
    invariant(compactOverflow.docHeight === compactOverflow.viewportHeight, "1280px layout has shell overflow");
    await compactPage.screenshot({ path: path.join(outputDir, "desktop-1280-mid.png"), fullPage: true });
    results.push({ check: "1280-layout", status: "pass", detail: compactOverflow });
    await compactPage.close();

    const reducedPage = await context.newPage();
    await reducedPage.emulateMedia({ reducedMotion: "reduce" });
    await reducedPage.goto(baseUrl, { waitUntil: "networkidle" });
    const animationName = await reducedPage.locator(".ghost-path").evaluate((node) => getComputedStyle(node).animationName);
    invariant(animationName === "none", "Ghost pulse is still active under prefers-reduced-motion");
    await reducedPage.screenshot({ path: path.join(outputDir, "desktop-1536-reduced-motion.png"), fullPage: true });
    results.push({ check: "reduced-motion", status: "pass", detail: "Ghost pulse disabled." });
    await reducedPage.close();

    invariant(errors.length === 0, `Browser errors detected:\n${errors.join("\n")}`);
    results.push({ check: "console-errors", status: "pass", detail: "No console or page errors." });

    fs.writeFileSync(path.join(outputDir, "qa-report.json"), `${JSON.stringify({ url: baseUrl, results, errors }, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ status: "pass", outputDir, results }, null, 2)}\n`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
