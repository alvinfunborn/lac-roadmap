import { CoordinateConverter } from '../../../components/map/GoogleMap';

describe('CoordinateConverter', () => {
  // GCJ-02 and WGS-84 differ by ~50-500m within China; outside China the
  // 偏移 algorithm still runs but the offset is small/garbage in most cases.
  // These tests assert behaviour close to the algorithm contract.

  describe('gcj02 ↔ wgs84 round-trip (China bounds)', () => {
    const samples: [string, number, number][] = [
      ['Beijing',  116.4074, 39.9042],
      ['Shanghai', 121.4737, 31.2304],
      ['Chengdu',  104.0668, 30.5728],
      ['Lhasa',     91.1409, 29.6452],
    ];
    samples.forEach(([city, lng, lat]) => {
      it(`${city}: gcj02→wgs84→gcj02 returns to within 0.0001°`, () => {
        const [wlng, wlat] = CoordinateConverter.gcj02ToWgs84(lng, lat);
        const [glng, glat] = CoordinateConverter.wgs84ToGcj02(wlng, wlat);
        // Two-step conversion is approximate — the forward and reverse
        // formulas aren't algebraic inverses (they share `transformLat`/
        // `transformLng` at the *same* lat/lng instead of the converted
        // one). The deviation in China stays under ~1e-4°.
        expect(Math.abs(glng - lng)).toBeLessThan(1e-4);
        expect(Math.abs(glat - lat)).toBeLessThan(1e-4);
      });

      it(`${city}: gcj02 != wgs84 (offset present)`, () => {
        const [wlng, wlat] = CoordinateConverter.gcj02ToWgs84(lng, lat);
        const dLng = Math.abs(wlng - lng);
        const dLat = Math.abs(wlat - lat);
        // The offset in China is in the 0.001-0.01° range.
        expect(dLng + dLat).toBeGreaterThan(1e-4);
      });
    });
  });

  describe('convertToWgs84', () => {
    it('returns input unchanged for wgs84 / gps / wgs-84', async () => {
      for (const sys of ['WGS84', 'wgs84', 'GPS', 'gps', 'WGS-84']) {
        const [lng, lat] = await CoordinateConverter.convertToWgs84(116.4, 39.9, sys);
        expect(lng).toBe(116.4);
        expect(lat).toBe(39.9);
      }
    });
    it('applies gcj02→wgs84 for gcj-02 / gcj02', async () => {
      const direct = CoordinateConverter.gcj02ToWgs84(116.4, 39.9);
      for (const sys of ['GCJ-02', 'gcj02', 'gcj-02']) {
        const r = await CoordinateConverter.convertToWgs84(116.4, 39.9, sys);
        expect(r[0]).toBeCloseTo(direct[0], 6);
        expect(r[1]).toBeCloseTo(direct[1], 6);
      }
    });
    it('returns input unchanged for unknown coord system (graceful fallback)', async () => {
      const r = await CoordinateConverter.convertToWgs84(116.4, 39.9, 'BD-09');
      expect(r).toEqual([116.4, 39.9]);
    });
    it('handles empty / undefined fromSystem (treats as unknown → passthrough)', async () => {
      const r = await CoordinateConverter.convertToWgs84(116.4, 39.9, '');
      expect(r).toEqual([116.4, 39.9]);
    });
  });
});
