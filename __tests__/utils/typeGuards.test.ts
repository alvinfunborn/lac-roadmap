import { isPlace, isRouteSegment } from '../../utils/typeGuards';
import { Place, RouteSegment } from '../../types/roadmap';

const place: Place = { id: 'p1', name: 'P1', detail: {} };
const route: RouteSegment = { travelMode: 'drive', distance: 1000, duration: 10, tolls: 0 };

describe('utils/typeGuards', () => {
  describe('isPlace', () => {
    it('true for object with name', () => {
      expect(isPlace(place)).toBe(true);
    });
    it('false for RouteSegment', () => {
      expect(isPlace(route)).toBe(false);
    });
    it('false for null / undefined', () => {
      expect(isPlace(null)).toBe(false);
      expect(isPlace(undefined)).toBe(false);
    });
    it('false for non-object', () => {
      expect(isPlace('x' as any)).toBe(false);
      expect(isPlace(123 as any)).toBe(false);
    });
  });

  describe('isRouteSegment', () => {
    it('true for object with travelMode and no name', () => {
      expect(isRouteSegment(route)).toBe(true);
    });
    it('false for Place', () => {
      expect(isRouteSegment(place)).toBe(false);
    });
    it('false for object missing travelMode', () => {
      expect(isRouteSegment({} as any)).toBe(false);
    });
    it('false for null / undefined', () => {
      expect(isRouteSegment(null)).toBe(false);
      expect(isRouteSegment(undefined)).toBe(false);
    });
    it('is mutually exclusive with isPlace', () => {
      const items: Array<Place | RouteSegment> = [place, route];
      items.forEach(it => {
        const p = isPlace(it);
        const r = isRouteSegment(it);
        expect(p && r).toBe(false);
        expect(p || r).toBe(true);
      });
    });
  });
});
