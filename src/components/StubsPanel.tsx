import { useState } from "react";
import { useStore } from "zustand";

import { FlaskIcon } from "./Icons";
import { appStore } from "../store";

export function StubsPanel() {
  const stubs = useStore(appStore, (state) => state.stubs);
  const [expanded, setExpanded] = useState(true);
  const [copyFeedback, setCopyFeedback] = useState("");

  const copyStub = async (text: string) => {
    try {
      if (navigator.clipboard === undefined) throw new Error("Clipboard is unavailable.");
      await navigator.clipboard.writeText(text);
      setCopyFeedback("Copied");
    } catch {
      setCopyFeedback("Copy failed, select the text manually");
    }
  };

  return (
    <section className={`stubs-drawer${expanded ? "" : " collapsed"}`} aria-labelledby="stubs-heading">
      <header className="stub-header">
        <FlaskIcon className="pane-icon" />
        <span className="stub-title" id="stubs-heading">Test Stubs ({stubs.length})</span>
        <button
          className="quiet-button stub-toggle"
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse Test Stubs" : "Expand Test Stubs"}
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="chevron" aria-hidden="true" />
        </button>
      </header>
      <div className="stub-body">
        {stubs.length === 0 ? <div className="stub-empty">No Test Stubs yet. Accept a Structural Gap to draft one.</div> : (
          <div className="stub-list">
            {stubs.map((stub, index) => (
              <article className="stub-card" key={`${stub.stateId}\u0000${stub.eventId}\u0000${index}`}>
                <button className="copy-button" type="button" onClick={() => void copyStub(stub.text)}>Copy Test Stub</button>
                <pre className="stub-code">{stub.text}</pre>
              </article>
            ))}
          </div>
        )}
        <p className="copy-feedback" role="status" aria-live="polite">{copyFeedback}</p>
      </div>
    </section>
  );
}
