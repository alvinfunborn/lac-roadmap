import { RouteCalculationService } from '../../services/RouteCalculationService';
import { Place } from '../../types/roadmap';
import {
  mockRequestUrl,
  resetRequestUrlMocks,
  getRequestUrlCalls,
} from '../__mocks__/obsidian';

function place(name: string, lng: number, lat: number, system?: string): Place {
  return {
    id: name,
    name,
    detail: { address: { name, longitude: lng, latitude: lat, coordinate_system: system } },
  };
}

beforeEach(() => {
  resetRequestUrlMocks();
});

describe('RouteCalculationService.calculateRoute (preconditions)', () => {
  it('returns null when from-coords missing', async () => {
    const svc = new RouteCalculationService('gkey');
    const from: Place = { id: 'A', name: 'A', detail: {} };
    const r = await svc.calculateRoute(from, place('B', 100, 30), 'drive', 'google');
    expect(r).toBeNull();
  });

  it('returns null when to-coords missing', async () => {
    const svc = new RouteCalculationService('gkey');
    const to: Place = { id: 'B', name: 'B', detail: {} };
    const r = await svc.calculateRoute(place('A', 100, 30), to, 'drive', 'google');
    expect(r).toBeNull();
  });

  it('returns null when no API key for the chosen provider', async () => {
    const svc = new RouteCalculationService(undefined, 'gaodekey');
    const r = await svc.calculateRoute(place('A', 100, 30), place('B', 101, 31), 'drive', 'google');
    expect(r).toBeNull();
  });
});

describe('RouteCalculationService — Google', () => {
  it('returns parsed distance / duration on OK', async () => {
    mockRequestUrl('maps.googleapis.com', () => ({
      status: 200,
      json: {
        status: 'OK',
        routes: [{ legs: [{ distance: { value: 12345 }, duration: { value: 540 } }] }],
      },
      text: '',
    }));

    const svc = new RouteCalculationService('gkey');
    const r = await svc.calculateRoute(place('A', 116.39, 39.91), place('B', 116.40, 39.92), 'drive', 'google');
    expect(r).toEqual({ distance: 12345, duration: 9, travelMode: 'drive', tolls: 0 });
  });

  it('maps travelMode to Google Directions mode parameter', async () => {
    mockRequestUrl('maps.googleapis.com', () => ({
      status: 200,
      json: { status: 'OK', routes: [{ legs: [{ distance: { value: 1 }, duration: { value: 60 } }] }] },
      text: '',
    }));
    const svc = new RouteCalculationService('gkey');
    await svc.calculateRoute(place('A', 1, 1), place('B', 2, 2), 'walk', 'google');
    await svc.calculateRoute(place('A', 1, 1), place('B', 2, 2), 'bicycle', 'google');
    await svc.calculateRoute(place('A', 1, 1), place('B', 2, 2), 'two_wheeler', 'google');
    await svc.calculateRoute(place('A', 1, 1), place('B', 2, 2), 'drive', 'google');
    await svc.calculateRoute(place('A', 1, 1), place('B', 2, 2), 'transit', 'google');
    const urls = getRequestUrlCalls().map(c => c.url);
    expect(urls[0]).toContain('mode=walking');
    expect(urls[1]).toContain('mode=bicycling');
    expect(urls[2]).toContain('mode=bicycling');
    expect(urls[3]).toContain('mode=driving');
    expect(urls[4]).toContain('mode=transit');
  });

  it('converts GCJ-02 input to WGS84 before sending', async () => {
    mockRequestUrl('maps.googleapis.com', () => ({
      status: 200,
      json: { status: 'OK', routes: [{ legs: [{ distance: { value: 1 }, duration: { value: 60 } }] }] },
      text: '',
    }));
    const svc = new RouteCalculationService('gkey');
    await svc.calculateRoute(
      place('A', 116.39, 39.91, 'GCJ-02'),
      place('B', 116.40, 39.92, 'gcj02'),
      'drive',
      'google',
    );
    const url = getRequestUrlCalls()[0].url;
    // Origin/destination should NOT contain the literal GCJ values; they must
    // be shifted by the WGS84 transform. Cheap check: the lat literal "39.91"
    // should not appear verbatim — conversion offsets it by ~0.001 degrees.
    expect(url).not.toContain('39.91,');
    expect(url).not.toContain('39.92&');
  });

  it('returns null when API replies non-OK status', async () => {
    mockRequestUrl('maps.googleapis.com', () => ({
      status: 200,
      json: { status: 'ZERO_RESULTS', routes: [] },
      text: '',
    }));
    const svc = new RouteCalculationService('gkey');
    const r = await svc.calculateRoute(place('A', 1, 1), place('B', 2, 2), 'drive', 'google');
    expect(r).toBeNull();
  });

  it('returns null on requestUrl exception', async () => {
    mockRequestUrl('maps.googleapis.com', () => { throw new Error('network down'); });
    const svc = new RouteCalculationService('gkey');
    const r = await svc.calculateRoute(place('A', 1, 1), place('B', 2, 2), 'drive', 'google');
    expect(r).toBeNull();
  });
});

describe('RouteCalculationService — Gaode', () => {
  it('parses driving paths[0]', async () => {
    mockRequestUrl('restapi.amap.com', () => ({
      status: 200,
      json: { status: '1', route: { paths: [{ distance: '5000', duration: '600' }] } },
      text: '',
    }));
    const svc = new RouteCalculationService(undefined, 'gaodekey');
    const r = await svc.calculateRoute(
      place('A', 116.39, 39.91, 'GCJ-02'),
      place('B', 116.40, 39.92, 'GCJ-02'),
      'drive',
      'gaode',
    );
    expect(r).toEqual({ distance: 5000, duration: 10, travelMode: 'drive', tolls: 0 });
  });

  it('parses transit transits[0] when travelMode=transit', async () => {
    mockRequestUrl('restapi.amap.com/v3/direction/transit/integrated', () => ({
      status: 200,
      json: { status: '1', route: { transits: [{ distance: '8000', duration: '1800' }] } },
      text: '',
    }));
    const svc = new RouteCalculationService(undefined, 'gaodekey');
    const r = await svc.calculateRoute(
      place('A', 116.39, 39.91, 'GCJ-02'),
      place('B', 116.40, 39.92, 'GCJ-02'),
      'transit',
      'gaode',
    );
    expect(r).toEqual({ distance: 8000, duration: 30, travelMode: 'transit', tolls: 0 });
  });

  it('chooses correct API path per travelMode', async () => {
    const seen: string[] = [];
    mockRequestUrl('restapi.amap.com', (req) => {
      seen.push(req.url);
      return {
        status: 200,
        json: { status: '1', route: { paths: [{ distance: '0', duration: '0' }] } },
        text: '',
      };
    });
    const svc = new RouteCalculationService(undefined, 'gaodekey');
    const a = place('A', 116.39, 39.91, 'GCJ-02');
    const b = place('B', 116.40, 39.92, 'GCJ-02');
    await svc.calculateRoute(a, b, 'walk', 'gaode');
    await svc.calculateRoute(a, b, 'bicycle', 'gaode');
    await svc.calculateRoute(a, b, 'two_wheeler', 'gaode');
    await svc.calculateRoute(a, b, 'drive', 'gaode');
    expect(seen[0]).toContain('/direction/walking');
    expect(seen[1]).toContain('/direction/bicycling');
    expect(seen[2]).toContain('/direction/bicycling');
    expect(seen[3]).toContain('/direction/driving');
  });

  it('converts WGS84 input to GCJ-02 before sending', async () => {
    mockRequestUrl('restapi.amap.com', () => ({
      status: 200,
      json: { status: '1', route: { paths: [{ distance: '0', duration: '0' }] } },
      text: '',
    }));
    const svc = new RouteCalculationService(undefined, 'gaodekey');
    await svc.calculateRoute(
      place('A', 116.39, 39.91, 'WGS84'),
      place('B', 116.40, 39.92, 'GPS'),
      'drive',
      'gaode',
    );
    const url = getRequestUrlCalls()[0].url;
    expect(url).not.toContain('116.39,39.91');
    expect(url).not.toContain('116.4,39.92');
  });

  it('returns null when status != "1"', async () => {
    mockRequestUrl('restapi.amap.com', () => ({
      status: 200,
      json: { status: '0', info: 'INVALID_KEY' },
      text: '',
    }));
    const svc = new RouteCalculationService(undefined, 'gaodekey');
    const r = await svc.calculateRoute(place('A', 1, 1), place('B', 2, 2), 'drive', 'gaode');
    expect(r).toBeNull();
  });

  it('returns null on requestUrl exception', async () => {
    mockRequestUrl('restapi.amap.com', () => { throw new Error('boom'); });
    const svc = new RouteCalculationService(undefined, 'gaodekey');
    const r = await svc.calculateRoute(place('A', 1, 1), place('B', 2, 2), 'drive', 'gaode');
    expect(r).toBeNull();
  });
});
