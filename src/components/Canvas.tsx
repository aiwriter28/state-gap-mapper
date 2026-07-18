import { useEffect, useMemo, useRef, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  ReactFlow,
  getBezierPath,
  getSmoothStepPath,
  type Connection,
  type EdgeProps,
  type NodeProps,
} from "@xyflow/react";
import { useStore } from "zustand";

import {
  addState,
  addTransition,
  deleteState,
  deleteTransition,
  renameEvent,
  renameState,
  setInitial,
  toggleFinal,
} from "../../lib/commands";
import type { Machine, MissingTransition } from "../../lib/machine";
import { CanvasIcon } from "./Icons";
import { appStore } from "../store";
import {
  buildFlowElements,
  type GhostFlowEdge,
  type GhostFlowNode,
  type MachineFlowEdge,
  type StateFlowNode,
} from "./flowLayout";

function StateNode({ data }: NodeProps<StateFlowNode>) {
  return (
    <div className={`state-node${data.final ? " final-state" : ""}${data.initial ? " initial-state" : ""}`}>
      {data.initial ? <span className="initial-entry" aria-hidden="true" /> : null}
      <Handle id="left-target" type="target" position={Position.Left} className="flow-handle" />
      <Handle id="top-target" type="target" position={Position.Top} className="flow-handle" />
      <Handle id="bottom-target" type="target" position={Position.Bottom} className="flow-handle" />
      <span className="state-label">{data.label}</span>
      {data.userAdded ? <span className="node-user-badge">Added by you</span> : null}
      <Handle id="right-source" type="source" position={Position.Right} className="flow-handle" />
      <Handle id="bottom-source" type="source" position={Position.Bottom} className="flow-handle" />
    </div>
  );
}

function GhostNode({ data }: NodeProps<GhostFlowNode>) {
  return (
    <div className="ghost-node" aria-label="Missing transition target unknown">
      <Handle type="target" position={Position.Left} className="ghost-handle" />
      {data.label}
    </div>
  );
}

function MachineEdge(props: EdgeProps<MachineFlowEdge>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
    borderRadius: 18,
  });
  return (
    <>
      <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} className="machine-edge" />
      <EdgeLabelRenderer>
        <div
          className="event-pill nodrag nopan"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          {props.data?.label}
          {props.data?.userAdded ? <span className="edge-user-badge">Added by you</span> : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

function GhostEdge(props: EdgeProps<GhostFlowEdge>) {
  const [path] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
    curvature: 0.36,
  });
  return (
    <BaseEdge
      id={props.id}
      path={path}
      markerEnd={props.markerEnd}
      className={`ghost-edge${props.data?.selected ? " selected" : ""}`}
    />
  );
}

const nodeTypes = { state: StateNode, ghost: GhostNode };
const edgeTypes = { machine: MachineEdge, ghost: GhostEdge };

function flagshipHole(machine: Machine | null, holes: MissingTransition[]): MissingTransition | null {
  if (machine === null || holes.length === 0) return null;
  return holes.find((hole) => hole.stateId === "processing" && hole.eventId === "cancel") ?? holes[0];
}

function firstOtherState(machine: Machine, stateId: string | null): string {
  return machine.states.find((state) => state.id !== stateId)?.id ?? machine.states[0]?.id ?? "";
}

export function Canvas() {
  const machine = useStore(appStore, (state) => state.machine);
  const gaps = useStore(appStore, (state) => state.gaps);
  const selectedHoleKey = useStore(appStore, (state) => state.selectedHoleKey);
  const phase = useStore(appStore, (state) => state.phase);
  const error = useStore(appStore, (state) => state.error);
  const viabilityRefusal = useStore(appStore, (state) => state.viabilityRefusal);
  const commandError = useStore(appStore, (state) => state.commandError);
  const extract = useStore(appStore, (state) => state.extract);
  const applyCommand = useStore(appStore, (state) => state.applyCommand);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectedStateId, setSelectedStateId] = useState<string | null>(null);
  const [stateName, setStateName] = useState("");
  const [newStateName, setNewStateName] = useState("");
  const [eventId, setEventId] = useState("");
  const [eventName, setEventName] = useState("");
  const [transitionFrom, setTransitionFrom] = useState("");
  const [transitionTo, setTransitionTo] = useState("");
  const [transitionEvent, setTransitionEvent] = useState("");
  const [newEventName, setNewEventName] = useState("");
  const [focusStateName, setFocusStateName] = useState(false);
  const stateNameInputRef = useRef<HTMLInputElement>(null);

  const ghostHole = flagshipHole(machine, gaps.missingTransitions);
  const elements = useMemo(
    () => machine === null ? { nodes: [], edges: [] } : buildFlowElements(machine, ghostHole, selectedHoleKey),
    [ghostHole, machine, selectedHoleKey],
  );
  const selectedState = machine?.states.find((state) => state.id === selectedStateId) ?? null;
  const selectedEvent = machine?.events.find((event) => event.id === eventId) ?? null;

  useEffect(() => {
    if (machine === null) return;
    if (selectedStateId === null || !machine.states.some((state) => state.id === selectedStateId)) {
      const state = machine.states[0];
      setSelectedStateId(state?.id ?? null);
      setStateName(state?.name ?? "");
    }
    if (eventId.length === 0 || !machine.events.some((event) => event.id === eventId)) {
      const event = machine.events[0];
      setEventId(event?.id ?? "");
      setEventName(event?.name ?? "");
      setTransitionEvent(event?.id ?? "");
    }
    if (transitionFrom.length === 0 || !machine.states.some((state) => state.id === transitionFrom)) {
      setTransitionFrom(machine.states[0]?.id ?? "");
    }
    if (transitionTo.length === 0 || !machine.states.some((state) => state.id === transitionTo)) {
      setTransitionTo(firstOtherState(machine, transitionFrom));
    }
  }, [eventId, machine, selectedStateId, transitionFrom, transitionTo]);

  useEffect(() => {
    if (!inspectorOpen || !focusStateName) return;
    stateNameInputRef.current?.focus();
    stateNameInputRef.current?.select();
    setFocusStateName(false);
  }, [focusStateName, inspectorOpen]);

  const openInspector = (
    stateId: string | null = selectedStateId,
    focusRename = false,
  ) => {
    if (machine === null) return;
    const state = machine.states.find((candidate) => candidate.id === stateId) ?? machine.states[0];
    if (state === undefined) return;
    setSelectedStateId(state.id);
    setStateName(state.name);
    setTransitionFrom(state.id);
    setTransitionTo(firstOtherState(machine, state.id));
    setFocusStateName(focusRename);
    setInspectorOpen(true);
  };

  const onConnect = (connection: Connection) => {
    if (connection.source === null || connection.target === null || machine === null) return;
    openInspector(connection.source);
    setTransitionFrom(connection.source);
    setTransitionTo(connection.target);
    setTransitionEvent(machine.events[0]?.id ?? "new");
  };

  const status = phase === "extracting"
    ? { title: "Extracting your state machine.", copy: "This takes a few seconds.", retry: false }
    : error !== null
      ? { title: error.message, copy: "Your previous machine is still intact.", retry: error.retryable }
      : viabilityRefusal !== null
        ? { title: "This does not look like a behavioral spec", copy: viabilityRefusal, retry: false }
        : null;

  return (
    <section className="pane canvas-pane" aria-labelledby="canvas-heading">
      <h2 className="pane-header" id="canvas-heading">
        <CanvasIcon className="pane-icon" />
        Canvas
        <button
          className="quiet-button header-action"
          type="button"
          disabled={machine === null}
          aria-expanded={inspectorOpen}
          onClick={() => inspectorOpen ? setInspectorOpen(false) : openInspector()}
        >
          Edit machine
        </button>
      </h2>
      <div className="canvas-field">
        {machine !== null ? (
          <ReactFlow
            nodes={elements.nodes}
            edges={elements.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.17, maxZoom: 1.12 }}
            minZoom={0.35}
            maxZoom={1.5}
            nodesConnectable
            edgesReconnectable={false}
            elementsSelectable
            deleteKeyCode={["Backspace", "Delete"]}
            onConnect={onConnect}
            onNodeDoubleClick={(_, node) => openInspector(node.id, true)}
            onEdgesDelete={(edges) => {
              for (const edge of edges) {
                if (edge.type !== "machine") continue;
                const event = edge.data as MachineFlowEdge["data"] | undefined;
                if (event !== undefined) applyCommand(deleteTransition, { from: edge.source, eventId: event.eventId });
              }
            }}
            proOptions={{ hideAttribution: true }}
            aria-label="Editable state machine"
          />
        ) : null}
        {machine === null && status === null ? (
          <div className="canvas-empty">
            <strong>Your state machine will appear here.</strong>
            <span>Start with a sample or paste a behavioral spec.</span>
          </div>
        ) : null}
        {status !== null ? (
          <div className="canvas-status" role="status">
            <strong>{status.title}</strong>
            <span>{status.copy}</span>
            {status.retry ? (
              <button className="soft-button" type="button" onClick={() => void extract()}>Retry</button>
            ) : null}
          </div>
        ) : null}
        {machine !== null && inspectorOpen ? (
          <aside className="canvas-inspector" aria-label="Machine inspector">
            <div className="inspector-header">
              <h3 className="inspector-title">Machine inspector</h3>
              <button className="quiet-button inspector-close" type="button" onClick={() => setInspectorOpen(false)}>Close</button>
            </div>

            <label className="field-label">
              State
              <select
                className="field-select"
                name="machine-state"
                value={selectedState?.id ?? ""}
                onChange={(event) => {
                  const state = machine.states.find((candidate) => candidate.id === event.target.value);
                  setSelectedStateId(event.target.value);
                  setStateName(state?.name ?? "");
                  setTransitionFrom(event.target.value);
                }}
              >
                {machine.states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
              </select>
            </label>
            <label className="field-label">
              State name
              <input ref={stateNameInputRef} className="field-input" name="machine-state-name" value={stateName} onChange={(event) => setStateName(event.target.value)} />
            </label>
            <div className="inspector-actions">
              <button className="soft-button" type="button" onClick={() => {
                if (selectedState === null) return;
                applyCommand(renameState, { id: selectedState.id, name: stateName });
              }}>Rename state</button>
              <button className="soft-button" type="button" onClick={() => {
                if (selectedState === null) return;
                applyCommand(setInitial, { id: selectedState.id });
              }}>Make initial</button>
              <button className="soft-button" type="button" onClick={() => {
                if (selectedState === null) return;
                applyCommand(toggleFinal, { id: selectedState.id });
              }}>{selectedState?.isFinal ? "Make non-final" : "Make final"}</button>
              <button
                className="soft-button danger-button"
                type="button"
                title={selectedState?.isInitial ? "The initial state cannot be deleted. Choose another initial state first." : "Delete this state and its incident transitions"}
                onClick={() => {
                  if (selectedState === null) return;
                  const result = applyCommand(deleteState, { id: selectedState.id });
                  if (result.ok) openInspector();
                }}
              >Delete state</button>
            </div>

            <h4 className="inspector-section-title">Add state</h4>
            <label className="field-label">
              New state name
              <input className="field-input" name="new-state-name" value={newStateName} onChange={(event) => setNewStateName(event.target.value)} />
            </label>
            <button className="soft-button" type="button" onClick={() => {
              const result = applyCommand(addState, { name: newStateName });
              if (result.ok) {
                const state = result.machine.states.at(-1);
                setNewStateName("");
                openInspector(state?.id ?? null);
              }
            }}>Add state</button>

            <h4 className="inspector-section-title">Event</h4>
            <label className="field-label">
              Event
              <select className="field-select" name="machine-event" value={selectedEvent?.id ?? ""} onChange={(event) => {
                const selected = machine.events.find((candidate) => candidate.id === event.target.value);
                setEventId(event.target.value);
                setEventName(selected?.name ?? "");
              }}>
                {machine.events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
              </select>
            </label>
            <label className="field-label">
              Event name
              <input className="field-input" name="machine-event-name" value={eventName} onChange={(event) => setEventName(event.target.value)} />
            </label>
            <button className="soft-button" type="button" onClick={() => {
              if (selectedEvent === null) return;
              applyCommand(renameEvent, { id: selectedEvent.id, name: eventName });
            }}>Rename event</button>
            {selectedEvent?.userAdded ? <span className="inspector-user-badge">Added by you</span> : null}

            <h4 className="inspector-section-title">Add transition</h4>
            <label className="field-label">From
              <select className="field-select" name="transition-from" value={transitionFrom} onChange={(event) => setTransitionFrom(event.target.value)}>
                {machine.states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
              </select>
            </label>
            <label className="field-label">To
              <select className="field-select" name="transition-to" value={transitionTo} onChange={(event) => setTransitionTo(event.target.value)}>
                {machine.states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
              </select>
            </label>
            <label className="field-label">Event
              <select className="field-select" name="transition-event" value={transitionEvent} onChange={(event) => setTransitionEvent(event.target.value)}>
                {machine.events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
                <option value="new">Create a new event</option>
              </select>
            </label>
            {transitionEvent === "new" ? <label className="field-label">New event name
              <input className="field-input" name="new-event-name" value={newEventName} onChange={(event) => setNewEventName(event.target.value)} />
            </label> : null}
            <button className="soft-button" type="button" onClick={() => {
              const event = transitionEvent === "new"
                ? { kind: "new" as const, name: newEventName }
                : { kind: "existing" as const, id: transitionEvent };
              const result = applyCommand(addTransition, { from: transitionFrom, to: transitionTo, event });
              if (result.ok) {
                setNewEventName("");
                if (transitionEvent === "new") setTransitionEvent(result.machine.events.at(-1)?.id ?? "");
              }
            }}>Add transition</button>

            <h4 className="inspector-section-title">Defined transitions</h4>
            {machine.transitions.filter((transition) => transition.from === selectedState?.id).map((transition) => (
              <div className="transition-row" key={`${transition.from}-${transition.event}`}>
                <span>{machine.events.find((event) => event.id === transition.event)?.name ?? transition.event} to {machine.states.find((state) => state.id === transition.to)?.name ?? transition.to}</span>
                <button className="quiet-button" type="button" onClick={() => applyCommand(deleteTransition, {
                  from: transition.from, eventId: transition.event,
                })}>Delete</button>
              </div>
            ))}
            <p className={commandError === null ? "inspector-feedback" : "inspector-feedback error"} aria-live="polite">
              {commandError?.message ?? "Edits validate first, then Structural Gaps recompute immediately."}
            </p>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
