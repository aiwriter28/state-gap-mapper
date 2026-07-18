import { Canvas } from "./components/Canvas";
import { GapPanel } from "./components/GapPanel";
import { SpecPane } from "./components/SpecPane";
import { StubsPanel } from "./components/StubsPanel";

export function App() {
  return (
    <main className="app-shell" aria-label="State Gap Mapper">
      <header className="app-header">
        <h1 className="wordmark">State Gap Mapper</h1>
        <p className="positioning">Paste how a feature should behave. See the state machine. Find what the spec forgot.</p>
        <a
          className="quiet-button docs-button"
          href="https://github.com/aiwriter28/state-gap-mapper#readme"
          target="_blank"
          rel="noreferrer"
        >
          Docs
        </a>
      </header>
      <section className="workspace">
        <SpecPane />
        <Canvas />
        <GapPanel />
      </section>
      <StubsPanel />
    </main>
  );
}
