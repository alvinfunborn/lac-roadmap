import { Place, RouteSegment } from '../../types/roadmap';
import { isPlace } from '../../utils/typeGuards';

/** 与 roadmapset 卡片标题颜色逻辑一致的地点状态色 */
export function getPlaceStatusColor(
  place: Place,
  groups: Record<string, Array<Place | RouteSegment>>
): string {
  const startTime = place.detail?.start_time;
  const endTime = place.detail?.end_time;
  const hasDate = startTime && /^\d{4}-\d{2}-\d{2}/.test(startTime);

  if (!hasDate) {
    for (const key of Object.keys(groups)) {
      const arr = groups[key] || [];
      if (arr.some(it => isPlace(it) && it.name === place.name)) {
        return 'lac-todo';
      }
    }
    return 'lac-na';
  }

  const now = new Date();
  try {
    if (startTime) {
      const startDate = new Date(startTime);
      if (startDate <= now) return 'lac-done';
    }
    if (endTime) {
      const endDate = new Date(endTime);
      if (endDate <= now) return 'lac-done';
    }
    return 'lac-todo';
  } catch {
    return 'lac-na';
  }
}

/**
 * Field-journal-style place time.
 * Output shape (matches docs/design/image copy 15.png):
 *   same-day + both times → `MM·DD · HH:MM → HH:MM`
 *   same-day + start only → `MM·DD · HH:MM`
 *   date only             → `MM·DD`
 *   time only             → `HH:MM` or `HH:MM → HH:MM`
 *   cross-day             → `MM·DD HH:MM → MM·DD HH:MM`
 */
export function formatPlaceTime(place: Place): string {
  const startTime = place.detail?.start_time;
  const endTime = place.detail?.end_time;
  if (!startTime) return '';

  const getDatePart = (s: string): string | null => {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[2]}·${m[3]}` : null;
  };
  const getTimePart = (s: string): string | null => {
    const m = s.match(/(?:^|\s)(\d{2}:\d{2})(?::\d{2})?/);
    return m ? m[1] : null;
  };

  const sDate = getDatePart(startTime);
  const sTime = getTimePart(startTime);
  const eDate = endTime ? getDatePart(endTime) : null;
  const eTime = endTime ? getTimePart(endTime) : null;

  // Compose `MM·DD · HH:MM` for a single moment.
  const compose = (date: string | null, time: string | null): string => {
    if (date && time) return `${date} · ${time}`;
    if (date) return date;
    if (time) return time;
    return '';
  };

  const left = compose(sDate, sTime);
  if (!endTime) return left;

  const sameDay = sDate && eDate && sDate === eDate;
  // Same-day with both times → `MM·DD · HH:MM → HH:MM` (don't repeat date).
  if (sameDay && sTime && eTime) return `${sDate} · ${sTime} → ${eTime}`;
  // Cross-day or one side missing date — full date+time on each side.
  const right = compose(eDate, eTime);
  if (!left) return right;
  if (!right) return left;
  return `${left} → ${right}`;
}
