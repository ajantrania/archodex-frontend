import { BaseEdge, EdgeLabelRenderer, type Edge, type EdgeProps } from '@xyflow/react';
import { ElkEdgeSection } from 'elkjs/lib/elk.bundled';
import { ISSUE_BADGE_SIZE } from './QueryGraph';

export interface ELKEdgeData extends Record<string, unknown> {
  originalSourceId: string;
  originalTargetId: string;
  label: { text?: string; x?: number; y?: number; width?: number };
  section?: ElkEdgeSection;
  events: ResourceEvent[];
  eventChainHovered?: boolean;
}

type ELKEdge = Edge<ELKEdgeData, 'elk'>;

const edgeClassName = (selected = false, eventChainHovered = false) => {
  // Stroke colors must be !important to override react-flow's default styles
  const classes = [];

  if (!eventChainHovered && !selected) {
    classes.push('opacity-40');
  }

  if (eventChainHovered) {
    classes.push('stroke-hover', 'stroke-[2px]');
  } else {
    classes.push('stroke-foreground', 'dark:stroke-primary');
  }

  if (selected) {
    classes.push('stroke-primary', 'stroke-[2px]', 'opacity-80');

    if (eventChainHovered) {
      classes.push('stroke-[3px]', 'opacity-100');
    }
  }

  return classes.join(' ');
};

const ELKEdge = ({ id, selected, data, markerEnd }: EdgeProps<ELKEdge>) => {
  if (!data) {
    return null;
  }

  const { label, section } = data;

  if (!section) {
    return null;
  }

  const segments = [];

  segments.push(`M ${String(section.startPoint.x - ISSUE_BADGE_SIZE / 2)} ${section.startPoint.y.toString()}`);

  for (const bendPoint of section.bendPoints ?? []) {
    segments.push(`L ${bendPoint.x.toString()} ${bendPoint.y.toString()}`);
  }

  segments.push(`L ${section.endPoint.x.toString()} ${section.endPoint.y.toString()}`);

  const path = segments.join(' ');

  const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];

  return (
    <g>
      <BaseEdge id={id} className={edgeClassName(selected, data.eventChainHovered)} path={path} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div
          // className="absolute z-1 p-[2px] text-[10px] bg-query-graph-bg"
          className="absolute z-1 p-[2px] text-[10px] bg-background"
          style={{
            transform: `translate(-50%, -50%) translate(${String(label.x)}px, ${String(calculateClosestPathMidpoint(label, points))}px)`,
          }}
        >
          {label.text}
        </div>
      </EdgeLabelRenderer>
    </g>
  );
};

// ELK doesn't seem to calculate label Y positions correctly, varying them
// randomly by a few pixels. This function calculates a Y position that centers
// labels vertically over the path segment they are positioned over.
const calculateClosestPathMidpoint = (
  label: { x?: number; y?: number; width?: number },
  points: { x: number; y: number }[],
) => {
  if (!label.x || !label.y || !label.width) {
    return label.y;
  }

  let closestPathYToLabel = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];

    if (
      (start.x <= label.x && end.x >= label.x) ||
      (start.x <= label.x + label.width && end.x >= label.x + label.width)
    ) {
      if (Math.abs(start.y - label.y) < Math.abs(closestPathYToLabel - label.y)) {
        closestPathYToLabel = start.y;
      }

      if (Math.abs(end.y - label.y) < Math.abs(closestPathYToLabel - label.y)) {
        closestPathYToLabel = end.y;
      }
    }
  }

  return closestPathYToLabel;
};

export default ELKEdge;
