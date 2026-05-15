import { Place } from '../types/roadmap';

export type PlaceStatus = 'done' | 'plan' | 'wish';

/**
 * Three-way status used for both card and map marker tinting.
 *  - past start/end date → 'done'
 *  - future date         → 'plan'
 *  - no date assigned    → 'wish'
 */
export function getPlaceStatus(place: Place): PlaceStatus {
  const startTime = place.detail?.start_time;
  const endTime = place.detail?.end_time;
  const hasDate = !!startTime && /^\d{4}-\d{2}-\d{2}/.test(startTime);
  if (!hasDate) return 'wish';
  const now = new Date();
  try {
    if (startTime) {
      const startDate = new Date(startTime);
      if (startDate <= now) return 'done';
    }
    if (endTime) {
      const endDate = new Date(endTime);
      if (endDate <= now) return 'done';
    }
    return 'plan';
  } catch {
    return 'wish';
  }
}
