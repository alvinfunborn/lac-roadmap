import { Place, Roadmap, RoadmapDetail, RouteSegment } from '../types/roadmap';
import { isPlace } from './typeGuards';

type Items = Array<Place | RouteSegment>;
const date = (s?: string) => s?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
const stamp = (s: string) => Date.parse(s + 'T00:00:00Z');
const difference = (a: string, b: string) => Math.round((stamp(b) - stamp(a)) / 86400000);
const shift = (s: string, n: number) => new Date(stamp(s.slice(0, 10)) + n * 86400000).toISOString().slice(0, 10) + s.slice(10);
export const firstDate = (items: Items) => items.filter(isPlace).map(p => date(p.detail.start_time)).filter(Boolean).sort()[0];
export const isDatedRoadmap = (r: Roadmap) => !!(firstDate(r.items) || date(r.detail?.start_time));
export const dayNumber = (p: Place) => Number.isInteger(p.detail.days) && p.detail.days! > 0 ? p.detail.days! : 1;

export function scheduleGroupKey(p: Place, dated: boolean): string {
  return date(p.detail.start_time) || (dated ? '' : `第${dayNumber(p)}天`);
}

/** Each occurrence owns its date/day; never store a shared POI's trip schedule globally. */
export function setRoadmapDate(items: Items, newDate?: string): Items {
  const old = firstDate(items);
  const next = date(newDate);
  const lastDay = old ? Math.max(1, ...items.filter(isPlace).map(p => date(p.detail.start_time) ? difference(old, date(p.detail.start_time)!) + 1 : 1)) : 1;
  return items.map(it => {
    if (!isPlace(it)) return it;
    const detail = { ...it.detail };
    const current = date(detail.start_time);
    if (!next) {
      // Keep gaps and repeated visits. Previously unplanned items form a final day.
      detail.days = current && old ? difference(old, current) + 1 : (detail.days || (old ? lastDay + 1 : 1));
      delete detail.start_time; delete detail.end_time;
    } else if (!old) {
      detail.start_time = shift(next, dayNumber(it) - 1);
      delete detail.end_time; delete detail.days;
    } else if (current) {
      const delta = difference(old, next);
      detail.start_time = shift(detail.start_time!, delta);
      if (date(detail.end_time)) detail.end_time = shift(detail.end_time!, delta);
      delete detail.days;
    }
    return { ...it, detail };
  });
}

/** On the first dated visit, align every relative day to that visit's chosen date. */
export function anchorFromPlace(before: Roadmap, items: Items, index: number, originalIndex = index): Items {
  const target = items[index];
  if (isDatedRoadmap(before) || !target || !isPlace(target) || !date(target.detail.start_time)) return items;
  const original = before.items[originalIndex];
  const n = original && isPlace(original) ? dayNumber(original) : dayNumber(target);
  const anchor = shift(date(target.detail.start_time)!, 1 - n);
  return items.map((it, i) => {
    if (!isPlace(it)) return it;
    const detail = { ...it.detail };
    if (i !== index) detail.start_time = shift(anchor, dayNumber(it) - 1);
    delete detail.days;
    return { ...it, detail };
  });
}

export function scheduleDetail(detail: RoadmapDetail, items: Items): RoadmapDetail {
  const out = { ...detail };
  const dates = items.filter(isPlace).map(p => date(p.detail.start_time)).filter(Boolean).sort();
  if (dates.length) { out.start_time = dates[0]; out.end_time = dates[dates.length - 1]; }
  return out;
}
