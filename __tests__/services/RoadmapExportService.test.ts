import { exportPlainText, exportICS, exportMarkdown, exportGpx } from '../../services/RoadmapExportService';
import { Roadmap, Place, RouteSegment } from '../../types/roadmap';

function makePlace(name: string, detail: Place['detail'] = {}): Place {
  return { id: name, name, detail };
}
function makeRoute(travelMode: RouteSegment['travelMode'], distance = 0, duration = 0, tolls = 0): RouteSegment {
  return { travelMode, distance, duration, tolls };
}

const sampleRoadmap: Roadmap = {
  id: 'kyoto-trip',
  name: '京都奈良两日',
  detail: {
    description: '伏见稻荷 · 东大寺 · 鹿',
    start_time: '2025-11-01',
    end_time: '2025-11-02',
  },
  items: [
    makePlace('京都站', { start_time: '2025-11-01 09:00', end_time: '2025-11-01 09:30', description: '抵达' }),
    makeRoute('transit', 4800, 18, 240),
    makePlace('伏见稻荷', {
      start_time: '2025-11-01 10:00',
      end_time: '2025-11-01 12:30',
      description: '千本鸟居',
      address: { name: '伏见稻荷大社', longitude: 135.7727, latitude: 34.9671, coordinate_system: 'WGS84' },
    }),
    makeRoute('walk', 34500, 482, 0),
    makePlace('东大寺', {
      start_time: '2025-11-02 14:00',
      end_time: '2025-11-02 16:00',
      address: { name: '东大寺', longitude: 135.8398, latitude: 34.6889, coordinate_system: 'WGS84' },
    }),
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// exportPlainText
// ─────────────────────────────────────────────────────────────────────────
describe('exportPlainText', () => {
  it('emits header with title and date range', () => {
    const out = exportPlainText(sampleRoadmap);
    expect(out).toContain('行程：京都奈良两日');
    expect(out).toContain('日期：2025-11-01 ~ 2025-11-02');
    expect(out).toContain('说明：伏见稻荷 · 东大寺 · 鹿');
  });

  it('groups by day key', () => {
    const out = exportPlainText(sampleRoadmap);
    expect(out).toContain('【2025-11-01】');
    expect(out).toContain('【2025-11-02】');
  });

  it('includes place times in (HH:MM - HH:MM) form', () => {
    const out = exportPlainText(sampleRoadmap);
    expect(out).toContain('京都站 (09:00 - 09:30)');
    expect(out).toContain('伏见稻荷 (10:00 - 12:30)');
  });

  it('renders route segments with translated mode + units', () => {
    const out = exportPlainText(sampleRoadmap);
    expect(out).toContain('公交');
    expect(out).toContain('4.8km');
    expect(out).toContain('18min');
    expect(out).toContain('费用 240 元');
  });

  it('totals line includes place count and totals', () => {
    const out = exportPlainText(sampleRoadmap);
    expect(out).toMatch(/总计：3 个地点/);
  });

  it('places with no time still appear (under "第N天" grouping)', () => {
    const noTime: Roadmap = {
      id: 'r', name: 'r', items: [makePlace('A'), makePlace('B')],
    };
    const out = exportPlainText(noTime);
    expect(out).toContain('第1天');
  });

  it('single date renders as "日期：YYYY-MM-DD" (no range)', () => {
    const r: Roadmap = { id: 'r', name: 'r', detail: { start_time: '2025-11-01', end_time: '2025-11-01' }, items: [] };
    expect(exportPlainText(r)).toContain('日期：2025-11-01');
    expect(exportPlainText(r)).not.toContain('~');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// exportICS
// ─────────────────────────────────────────────────────────────────────────
describe('exportICS', () => {
  it('opens with VCALENDAR header and PRODID', () => {
    const out = exportICS(sampleRoadmap);
    expect(out.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(out).toContain('PRODID:-//LaC//Roadmap//CN');
    expect(out).toContain('END:VCALENDAR');
  });

  it('emits one VEVENT per place with start_time', () => {
    const out = exportICS(sampleRoadmap);
    const matches = out.match(/BEGIN:VEVENT/g) || [];
    expect(matches.length).toBe(3);
  });

  it('skips places with no time', () => {
    const r: Roadmap = { id: 'r', name: 'r', items: [makePlace('No time')] };
    const out = exportICS(r);
    expect(out).not.toContain('BEGIN:VEVENT');
  });

  it('emits DTSTART:YYYYMMDDTHHMMSSZ for timed events', () => {
    const out = exportICS(sampleRoadmap);
    expect(out).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(out).toMatch(/DTEND:\d{8}T\d{6}Z/);
  });

  it('emits DTSTART;VALUE=DATE for all-day events', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [makePlace('整日', { start_time: '2025-11-01', end_time: '2025-11-01' })],
    };
    const out = exportICS(r);
    expect(out).toContain('DTSTART;VALUE=DATE:20251101');
    expect(out).toContain('DTEND;VALUE=DATE:20251101');
  });

  it('escapes commas/semicolons/newlines in SUMMARY and DESCRIPTION', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [makePlace('a,b;c', { start_time: '2025-11-01 09:00', description: 'line1\nline2' })],
    };
    const out = exportICS(r);
    expect(out).toContain('SUMMARY:a\\,b\\;c');
    expect(out).toContain('DESCRIPTION:line1\\nline2');
  });

  it('folds lines > 75 bytes per RFC 5545', () => {
    const longName = 'a'.repeat(200);
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [makePlace(longName, { start_time: '2025-11-01 09:00' })],
    };
    const out = exportICS(r);
    // After folding, a CRLF + space joins continuation lines.
    expect(out).toMatch(/SUMMARY:a+\r\n a+/);
  });

  it('uses CRLF line endings', () => {
    const out = exportICS(sampleRoadmap);
    expect(out.includes('\r\n')).toBe(true);
  });

  it('emits LOCATION when address.name present', () => {
    const out = exportICS(sampleRoadmap);
    expect(out).toContain('LOCATION:伏见稻荷大社');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// exportMarkdown
// ─────────────────────────────────────────────────────────────────────────
describe('exportMarkdown', () => {
  it('emits H1 title', () => {
    expect(exportMarkdown(sampleRoadmap)).toContain('# 京都奈良两日');
  });

  it('emits H2 per day group', () => {
    const out = exportMarkdown(sampleRoadmap);
    expect(out).toContain('## 2025-11-01');
    expect(out).toContain('## 2025-11-02');
  });

  it('wraps place names in Wikilinks for Obsidian round-tripping', () => {
    const out = exportMarkdown(sampleRoadmap);
    expect(out).toContain('**[[京都站]]**');
    expect(out).toContain('**[[伏见稻荷]]**');
  });

  it('renders address with 📍 emoji', () => {
    const out = exportMarkdown(sampleRoadmap);
    expect(out).toContain('📍 伏见稻荷大社');
  });

  it('emits a stats table at the end', () => {
    const out = exportMarkdown(sampleRoadmap);
    expect(out).toContain('## 总计');
    expect(out).toContain('| 指标 | 数值 |');
    expect(out).toContain('| 地点数 | 3 |');
    expect(out).toContain('| 天数 | 2 |');
  });

  it('renders blockquote for description', () => {
    expect(exportMarkdown(sampleRoadmap)).toContain('> 伏见稻荷');
  });

  it('renders route segments with → and translated mode', () => {
    const out = exportMarkdown(sampleRoadmap);
    expect(out).toMatch(/→ 公交 4\.8km · 18min · 费用 240/);
    expect(out).toMatch(/→ 步行/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// exportGpx
// ─────────────────────────────────────────────────────────────────────────
describe('exportGpx', () => {
  it('emits valid GPX 1.1 XML preamble', () => {
    const out = exportGpx(sampleRoadmap);
    expect(out.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(out).toContain('<gpx version="1.1"');
    expect(out).toContain('xmlns="http://www.topografix.com/GPX/1/1"');
  });

  it('emits metadata block with name + time', () => {
    const out = exportGpx(sampleRoadmap);
    expect(out).toContain('<name>京都奈良两日</name>');
    expect(out).toMatch(/<time>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z<\/time>/);
  });

  it('emits one <wpt> per geocoded place', () => {
    const out = exportGpx(sampleRoadmap);
    const wpts = out.match(/<wpt /g) || [];
    expect(wpts.length).toBe(2); // 伏见稻荷 + 东大寺 (京都站 has no address)
  });

  it('emits <trk>/<trkseg> when >= 2 geocoded places', () => {
    const out = exportGpx(sampleRoadmap);
    expect(out).toContain('<trk>');
    expect(out).toContain('<trkseg>');
    expect((out.match(/<trkpt /g) || []).length).toBe(2);
  });

  it('omits <trk> when only 0/1 geocoded places', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [makePlace('one', { address: { name: 'X', longitude: 1, latitude: 2, coordinate_system: 'WGS84' } })],
    };
    const out = exportGpx(r);
    expect(out).toContain('<wpt');
    expect(out).not.toContain('<trk>');
  });

  it('GCJ-02 coords are converted to WGS-84', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [
        makePlace('A', { address: { name: 'A', longitude: 116.4074, latitude: 39.9042, coordinate_system: 'GCJ-02' } }),
        makePlace('B', { address: { name: 'B', longitude: 121.4737, latitude: 31.2304, coordinate_system: 'GCJ-02' } }),
      ],
    };
    const out = exportGpx(r);
    // The output should NOT contain the raw GCJ-02 coords; the converted
    // values differ by ~0.001-0.01°.
    expect(out).not.toContain('lat="39.9042" lon="116.4074"');
    expect(out).toMatch(/lat="39\.\d{4,}" lon="116\.\d{4,}"/);
  });

  it('escapes XML special chars in name/desc', () => {
    const r: Roadmap = {
      id: 'r', name: 'a < b & c "d"',
      items: [makePlace('x', { address: { name: 'n', longitude: 1, latitude: 2 } })],
    };
    const out = exportGpx(r);
    expect(out).toContain('a &lt; b &amp; c &quot;d&quot;');
  });

  it('skips places with no address / partial coords', () => {
    const r: Roadmap = {
      id: 'r', name: 'r',
      items: [
        makePlace('no-addr'),
        makePlace('partial', { address: { name: 'p', longitude: 1 } as any }),
        makePlace('ok', { address: { name: 'ok', longitude: 1, latitude: 2 } }),
      ],
    };
    const out = exportGpx(r);
    expect((out.match(/<wpt /g) || []).length).toBe(1);
  });
});
