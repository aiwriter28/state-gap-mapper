import dagre from "dagre";
import { MarkerType, type Edge, type Node } from "@xyflow/react";

import type { Machine, MissingTransition } from "../../lib/machine";

export interface StateNodeData extends Record<string, unknown> {
  label: string;
  initial: boolean;
  final: boolean;
  userAdded: boolean;
}

export interface GhostNodeData extends Record<string, unknown> {
  label: string;
}

export interface MachineEdgeData extends Record<string, unknown> {
  label: string;
  eventId: string;
  userAdded: boolean;
}

export interface GhostEdgeData extends Record<string, unknown> {
  selected: boolean;
}

export type StateFlowNode = Node<StateNodeData, "state">;
export type GhostFlowNode = Node<GhostNodeData, "ghost">;
export type FlowNode = StateFlowNode | GhostFlowNode;
export type MachineFlowEdge = Edge<MachineEdgeData, "machine">;
export type GhostFlowEdge = Edge<GhostEdgeData, "ghost">;
export type FlowEdge = MachineFlowEdge | GhostFlowEdge;

export interface FlowElements {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

const NODE_HEIGHT = 78;

function nodeWidth(label: string): number {
  return Math.max(136, Math.min(220, label.length * 11 + 58));
}

export function buildFlowElements(
  machine: Machine,
  ghostHole: MissingTransition | null,
  selectedHoleKey: string | null,
): FlowElements {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "LR", nodesep: 88, ranksep: 138, marginx: 26, marginy: 30 });

  for (const state of machine.states) {
    graph.setNode(state.id, { width: nodeWidth(state.id), height: NODE_HEIGHT });
  }
  for (const transition of machine.transitions) graph.setEdge(transition.from, transition.to);
  dagre.layout(graph);

  const nodes: FlowNode[] = machine.states.map((state) => {
    const position = graph.node(state.id) as { x: number; y: number };
    const width = nodeWidth(state.id);
    return {
      id: state.id,
      type: "state",
      position: { x: position.x - width / 2, y: position.y - NODE_HEIGHT / 2 },
      data: { label: state.name, initial: state.isInitial, final: state.isFinal, userAdded: state.userAdded === true },
      style: { width, height: NODE_HEIGHT },
      ariaLabel: `${state.isInitial ? "Initial " : ""}${state.isFinal ? "Final " : ""}state ${state.name}`,
    };
  });

  const stateNodes = nodes.filter((node): node is StateFlowNode => node.type === "state");
  const nonFinalPositions = machine.states
    .filter((state) => !state.isFinal)
    .map((state) => stateNodes.find((node) => node.id === state.id)?.position.y ?? 0);
  const top = Math.min(
    ...(nonFinalPositions.length > 0
      ? nonFinalPositions
      : stateNodes.map((node) => node.position.y)),
  );
  for (const state of machine.states) {
    const node = stateNodes.find((candidate) => candidate.id === state.id);
    if (node === undefined) continue;
    if (!state.isFinal) {
      node.position.y = top;
      continue;
    }
    const incoming = machine.transitions.find((transition) => transition.to === state.id);
    const source = incoming === undefined
      ? undefined
      : stateNodes.find((candidate) => candidate.id === incoming.from);
    if (source !== undefined) {
      node.position.x = source.position.x + (nodeWidth(source.data.label) - nodeWidth(state.id)) / 2;
      node.position.y = top + 208;
    }
  }

  const finalIds = new Set(machine.states.filter((state) => state.isFinal).map((state) => state.id));
  const edges: FlowEdge[] = machine.transitions.map((transition, index) => {
    const source = stateNodes.find((node) => node.id === transition.from);
    const target = stateNodes.find((node) => node.id === transition.to);
    const vertical = finalIds.has(transition.to);
    const backward = source !== undefined && target !== undefined && target.position.x <= source.position.x;
    return {
      id: `transition-${index}-${transition.from}-${transition.event}`,
      type: "machine",
      source: transition.from,
      target: transition.to,
      sourceHandle: vertical || backward ? "bottom-source" : "right-source",
      targetHandle: vertical ? "top-target" : backward ? "bottom-target" : "left-target",
      data: {
        label: machine.events.find((event) => event.id === transition.event)?.name ?? transition.event,
        eventId: transition.event,
        userAdded: transition.userAdded === true,
      },
      deletable: true,
      markerEnd: { type: MarkerType.ArrowClosed, color: "#DDE9F5", width: 17, height: 17 },
    };
  });

  if (ghostHole !== null) {
    const source = nodes.find((node) => node.id === ghostHole.stateId);
    if (source !== undefined) {
      const ghostId = `ghost-${ghostHole.stateId}-${ghostHole.eventId}`;
      nodes.push({
        id: ghostId,
        type: "ghost",
        position: { x: source.position.x + 310, y: source.position.y + 154 },
        data: { label: "???" },
        style: { width: 112, height: 62 },
        draggable: false,
        selectable: false,
      });
      edges.push({
        id: `ghost-edge-${ghostHole.stateId}-${ghostHole.eventId}`,
        type: "ghost",
        source: ghostHole.stateId,
        target: ghostId,
        sourceHandle: "right-source",
        data: {
          selected: selectedHoleKey === `${ghostHole.stateId}\u0000${ghostHole.eventId}`,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#E8474F", width: 15, height: 15 },
      });
    }
  }
  return { nodes, edges };
}
