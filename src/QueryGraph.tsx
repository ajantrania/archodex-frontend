import React, { useCallback, useContext, useEffect, useLayoutEffect, useMemo } from 'react';

import {
  type Edge,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  Controls,
  ControlButton,
  useViewport,
  MarkerType,
  OnMove,
} from '@xyflow/react';

import '@xyflow/react/dist/base.css';
import './Flow.css';
import ResourceNode, { ResourceNodeData } from './ResourceNode';
import ELKEdge, { ELKEdgeData } from './ELKEdge';
import { Maximize, Maximize2, Minimize2, Minus, Plus } from 'lucide-react';
import { Skeleton } from './components/ui/skeleton';
import QueryDataDispatchContext from './contexts/QueryDataDispatchContext';
import { QueryDataActions, LayoutState, Links, EventChainLinks, ViewportTransition } from './hooks/useQueryData';
import { FIT_VIEW_DURATION } from './hooks/useQueryData/actions/fitView';
import posthog from 'posthog-js';
import { typeIdFromResourceId } from './lib/utils';

export const ISSUE_BADGE_SIZE = 26;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 1;

export interface QueryGraphProps {
  nodes: Record<string, Node<ResourceNodeData>>;
  edges: Record<string, Edge<ELKEdgeData>>;
  eventChainLinks: EventChainLinks;
  laidOut: LayoutState;
  viewport: ViewportTransition;
}

const QueryGraph: React.FC<QueryGraphProps> = (props) => {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
};

// If a user "clicks" but in the process moved a pixel or more, it will only be
// registered as a drag. This handler is used to detect "clicks" where the user
// moved the mouse up to 5 pixels. If so, it leaves the drag movement as-is, but
// also synthesizes and dispatches a click event.
let lastMouseCoords: { x: number; y: number } | undefined;
let distanceMoved = 0;
const dragClickHandler: OnMove = (event) => {
  if (!event) {
    return;
  }

  if (event.type === 'mousedown') {
    const mouseEvent = event as MouseEvent;
    lastMouseCoords = { x: mouseEvent.clientX, y: mouseEvent.clientY };
    distanceMoved = 0;
  } else if (event.type === 'mousemove' || event.type === 'mouseup') {
    const mouseEvent = event as MouseEvent;

    if (!lastMouseCoords) {
      return;
    }

    const dx = mouseEvent.clientX - lastMouseCoords.x;
    const dy = mouseEvent.clientY - lastMouseCoords.y;

    distanceMoved += Math.sqrt(dx * dx + dy * dy);
    lastMouseCoords = { x: mouseEvent.clientX, y: mouseEvent.clientY };

    if (event.type === 'mouseup') {
      if (distanceMoved < 5) {
        // If the mouse moved less than 5px, consider it a click
        const element = document.elementFromPoint(mouseEvent.clientX, mouseEvent.clientY);
        if (element) {
          // Create and dispatch mousedown event
          const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: mouseEvent.clientX,
            clientY: mouseEvent.clientY,
          });
          element.dispatchEvent(clickEvent);
        }
      }

      lastMouseCoords = undefined;
      distanceMoved = 0;
    }
  }
};

const Inner: React.FC<QueryGraphProps> = ({ nodes, edges, eventChainLinks, laidOut, viewport }) => {
  const queryDataDispatch = useContext(QueryDataDispatchContext);
  const { setViewport, zoomIn, zoomOut } = useReactFlow<Node<ResourceNodeData>, Edge<ELKEdgeData>>();
  const { zoom } = useViewport();

  const types = useMemo(() => ({ node: { resource: ResourceNode }, edge: { elk: ELKEdge } }), []);

  useEffect(() => {
    void setViewport(viewport, { duration: viewport.duration });
  }, [setViewport, viewport]);

  useLayoutEffect(() => {
    if (laidOut === LayoutState.Initial) {
      queryDataDispatch({ action: QueryDataActions.InitialRenderCompleted });
    }
  }, [laidOut, queryDataDispatch]);

  const nodesArray = useMemo(() => Object.values(nodes), [nodes]);

  // We track hovered edge state here in Flow rather than via the useQueryData
  // reducer. It's too much of a performance hit to update the entire reducer
  // data state, and hover state is ephemeral enough that it becoming out of
  // sync shouldn't be an issue.
  const [hoveredEdges, setHoveredEdges] = React.useState<Set<string>>(new Set());
  const handleEdgeHover = useCallback((event: React.MouseEvent, edge: Edge<ELKEdgeData>) => {
    setHoveredEdges((prev) => {
      const newHovered = new Set(prev);
      if (event.type === 'mouseenter') {
        newHovered.add(edge.id);
      } else {
        newHovered.delete(edge.id);
      }
      return newHovered;
    });
  }, []);

  const edgesArray = useMemo(() => {
    if (hoveredEdges.size === 0) {
      return Object.values(edges);
    }

    const edgesWithHovered = { ...edges };
    for (const edgeId of hoveredEdges) {
      // Because hoveredEdges is possibly out of sync with the rest of the
      // state, we must be extra careful to check that the edge still exists
      // in our data set.
      const edgeEventChainLinks = eventChainLinks[edgeId] as Links | undefined;
      if (!edgeEventChainLinks) {
        continue;
      }

      const eventChainEdgeIds = [edgeId, ...edgeEventChainLinks.preceding, ...edgeEventChainLinks.following];

      for (const eventChainEdgeId of eventChainEdgeIds) {
        const edge = edges[eventChainEdgeId] as Edge<ELKEdgeData> | undefined;
        if (!edge?.data) {
          continue;
        }

        edgesWithHovered[eventChainEdgeId] = { ...edge, data: { ...edge.data, eventChainHovered: true } };
      }
    }

    return Object.values(edgesWithHovered);
  }, [edges, eventChainLinks, hoveredEdges]);

  return (
    <>
      {/* <div className="size-full relative bg-query-graph-bg"> */}
      <div className="size-full relative">
        {laidOut !== LayoutState.LaidOut && (
          <div className="absolute z-10 size-full bg-background flex items-center justify-center skeleton-loader">
            <div className="flex flex-col items-center space-y-8">
              {/* Graph-like skeleton structure */}
              <div className="flex items-center space-x-8">
                <Skeleton className="h-20 w-32 rounded-lg" />
                <div className="flex items-center space-x-2">
                  <Skeleton className="h-1 w-8" />
                  <Skeleton className="h-2 w-2 rounded-full" />
                  <Skeleton className="h-1 w-8" />
                </div>
                <Skeleton className="h-20 w-32 rounded-lg" />
              </div>

              <div className="flex items-center space-x-12">
                <Skeleton className="h-16 w-24 rounded-lg" />
                <div className="flex flex-col space-y-2">
                  <Skeleton className="h-1 w-6" />
                  <Skeleton className="h-1 w-6" />
                  <Skeleton className="h-1 w-6" />
                </div>
                <Skeleton className="h-16 w-24 rounded-lg" />
                <div className="flex flex-col space-y-2">
                  <Skeleton className="h-1 w-6" />
                  <Skeleton className="h-1 w-6" />
                </div>
                <Skeleton className="h-16 w-24 rounded-lg" />
              </div>

              <div className="flex items-center space-x-6">
                <Skeleton className="h-12 w-20 rounded-lg" />
                <Skeleton className="h-1 w-4" />
                <Skeleton className="h-12 w-20 rounded-lg" />
                <Skeleton className="h-1 w-4" />
                <Skeleton className="h-12 w-20 rounded-lg" />
              </div>
            </div>
          </div>
        )}
        <ReactFlow
          colorMode="system"
          nodesDraggable={false}
          nodeTypes={types.node}
          edgeTypes={types.edge}
          nodes={nodesArray}
          edges={edgesArray}
          defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed, color: 'unselected' } }}
          onNodesChange={(nodeChanges) => {
            for (const change of nodeChanges.filter((c) => c.type === 'select')) {
              if (change.selected) {
                posthog.capture('graph_resource_selected', {
                  resource_type: typeIdFromResourceId(nodes[change.id].data.id),
                });
                queryDataDispatch({ action: QueryDataActions.SelectResource, resourceId: change.id, refitView: false });
              } else {
                posthog.capture('graph_resource_deselected', {
                  resource_type: typeIdFromResourceId(nodes[change.id].data.id),
                });
                queryDataDispatch({ action: QueryDataActions.DeselectResource, resourceId: change.id });
              }
            }
          }}
          onEdgesChange={(edgeChanges) => {
            for (const change of edgeChanges.filter((c) => c.type === 'select')) {
              const principal = edges[change.id].data?.events[0]?.principal;
              const resource = edges[change.id].data?.events[0]?.resource;

              if (change.selected) {
                posthog.capture('graph_event_selected', {
                  principal_type: principal ? typeIdFromResourceId(principal) : undefined,
                  event_type: edges[change.id].data?.events[0]?.type,
                  resource_type: resource ? typeIdFromResourceId(resource) : undefined,
                });
                queryDataDispatch({ action: QueryDataActions.SelectEdge, edgeId: change.id, refitView: false });
              } else {
                posthog.capture('graph_event_deselected', {
                  principal_type: principal ? typeIdFromResourceId(principal) : undefined,
                  event_type: edges[change.id].data?.events[0]?.type,
                  resource_type: resource ? typeIdFromResourceId(resource) : undefined,
                });
                queryDataDispatch({ action: QueryDataActions.DeselectEdge, edgeId: change.id });
              }
            }
          }}
          onEdgeMouseEnter={handleEdgeHover}
          onEdgeMouseLeave={handleEdgeHover}
          onMoveStart={dragClickHandler}
          onMove={dragClickHandler}
          onMoveEnd={dragClickHandler}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          proOptions={{ hideAttribution: true }}
          className="[&_.react-flow\_\_node]:pointer-events-none!"
          zoomOnDoubleClick={false}
        >
          <Controls
            // React flow has built-in styling that is hard to override...
            className={[
              'bg-background',
              //'shadow-[0_0_2px_1px_rgba(0,0,0,0.08)]',
              '*:not-last:border-b',
              // Shadows don't work as well in dark mode
              //'dark:shadow-none',
              'border',
              'shadow-md',
              // Color for disabled button icons
              '*:disabled:[&_svg]:stroke-[#ddd]',
              '*:disabled:[&_svg]:dark:stroke-[#777]',
            ].join(' ')}
            position="top-right"
            showInteractive={false}
            showZoom={false}
            showFitView={false}
            aria-label="Archodex diagram controls"
          >
            <ControlButton
              onClick={() => {
                posthog.capture('graph_zoom_in');
                zoomIn({ duration: FIT_VIEW_DURATION }).catch((error: unknown) => {
                  console.error('Zoom in error: ', error);
                });
              }}
              title="zoom in"
              aria-label="zoom in"
              disabled={zoom >= MAX_ZOOM}
            >
              <Plus />
            </ControlButton>
            <ControlButton
              onClick={() => {
                posthog.capture('graph_zoom_out');
                zoomOut({ duration: FIT_VIEW_DURATION }).catch((error: unknown) => {
                  console.error('Zoom out error: ', error);
                });
              }}
              title="zoom out"
              aria-label="zoom out"
              disabled={zoom <= MIN_ZOOM}
            >
              <Minus />
            </ControlButton>
            <ControlButton
              onClick={() => {
                posthog.capture('graph_fit_view');
                queryDataDispatch({ action: QueryDataActions.FitView, duration: FIT_VIEW_DURATION });
              }}
              title="fit view"
              aria-label="fit view"
            >
              <Maximize />
            </ControlButton>
            <ControlButton
              onClick={() => {
                posthog.capture('graph_expand_all');
                queryDataDispatch({ action: QueryDataActions.ExpandAll });
              }}
              title="expand all"
              aria-label="expand all"
            >
              <Maximize2 />
            </ControlButton>
            <ControlButton
              onClick={() => {
                posthog.capture('graph_collapse_all');
                queryDataDispatch({ action: QueryDataActions.CollapseAll });
              }}
              title="collapse all"
              aria-label="collapse all"
            >
              <Minimize2 />
            </ControlButton>
          </Controls>
        </ReactFlow>
      </div>
    </>
  );
};

export default QueryGraph;
