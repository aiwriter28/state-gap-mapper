import { useState } from "react";
import { useStore } from "zustand";

import { FlaskIcon } from "./Icons";
import { appStore } from "../store";

export function StubsPanel() {
  const stubs = useStore(appStore, (state) => state.stubs);
  const [expanded, setExpanded] = useState(true);
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
        <div className="stub-empty">No Test Stubs yet. Accept a Structural Gap to draft one.</div>
      </div>
    </section>
  );
}
