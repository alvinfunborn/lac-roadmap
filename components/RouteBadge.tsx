import { RouteSegment } from '../types/roadmap';

export default function RouteBadge({ segment }: { segment: RouteSegment }) {
  return (
    <div className="lac-row">
      <span className="lac-tag">{segment.travelMode}</span>
      {typeof segment.distance === 'number' && <span className="lac-tag">{segment.distance}m</span>}
      {typeof segment.duration === 'number' && <span className="lac-tag">{segment.duration}min</span>}
      {typeof segment.tolls === 'number' && <span className="lac-tag">¥{segment.tolls}</span>}
    </div>
  );
}


