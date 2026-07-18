import { useMemo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  ReactFlow,
  getBezierPath,
  getSmoothStepPath,
  type EdgeProps,
  type NodeProps,
} from "@xyflow/react";
import { useStore } from "zustand";

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

export function Canvas() {
  const machine = useStore(appStore, (state) => state.machine);
  const gaps = useStore(appStore, (state) => state.gaps);
  const selectedHoleKey = useStore(appStore, (state) => state.selectedHoleKey);
  const phase = useStore(appStore, (state) => state.phase);
  const error = useStore(appStore, (state) => state.error);
  const viabilityRefusal = useStore(appStore, (state) => state.viabilityRefusal);
  const extract = useStore(appStore, (state) => state.extract);

  const ghostHole = flagshipHole(machine, gaps.missingTransitions);
  const elements = useMemo(
    () => machine === null ? { nodes: [], edges: [] } : buildFlowElements(machine, ghostHole, selectedHoleKey),
    [ghostHole, machine, selectedHoleKey],
  );

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
        <button className="quiet-button header-action" type="button" disabled>Edit machine</button>
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
            nodesConnectable={false}
            edgesReconnectable={false}
            elementsSelectable={false}
            proOptions={{ hideAttribution: true }}
            aria-label="Extracted state machine"
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
      </div>
    </section>
  );
}
