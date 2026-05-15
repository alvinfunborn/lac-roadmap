import { Roadmap, Place, RouteSegment } from '../types/roadmap';
import { isPlace, isRouteSegment } from '../utils/typeGuards';

/**
 * 生成纯文本行程单（发给同行伙伴看的可读格式）
 */
export function exportPlainText(roadmap: Roadmap): string {
  const lines: string[] = [];
  lines.push(`行程：${roadmap.name}`);
  const s = roadmap.detail?.start_time;
  const e = roadmap.detail?.end_time;
  if (s || e) {
    const sp = s ? String(s).split(' ')[0] : '';
    const ep = e ? String(e).split(' ')[0] : '';
    if (sp && ep && sp !== ep) lines.push(`日期：${sp} ~ ${ep}`);
    else lines.push(`日期：${sp || ep}`);
  }
  if (roadmap.detail?.description) {
    lines.push(`说明：${roadmap.detail.description}`);
  }
  lines.push('');

  // 按日分组
  const groups: Record<string, Array<Place | RouteSegment>> = {};
  const keyOrder: string[] = [];
  let dayIndex = 1;
  let currentKey = '';
  for (let i = 0; i < roadmap.items.length; i++) {
    const it = roadmap.items[i];
    if (isPlace(it)) {
      const start = it.detail?.start_time;
      const key = start ? String(start).split(' ')[0] : `第${it.detail?.days ?? dayIndex}天`;
      if (key !== currentKey) {
        currentKey = key;
        if (!start) dayIndex++;
        if (!groups[key]) { groups[key] = []; keyOrder.push(key); }
      }
      groups[currentKey].push(it);
      const next = roadmap.items[i + 1];
      if (isRouteSegment(next)) {
        groups[currentKey].push(next);
      }
    }
  }

  let totalDistance = 0;
  let totalDuration = 0;
  let totalTolls = 0;
  let placeCount = 0;

  for (const k of keyOrder) {
    lines.push(`【${k}】`);
    const dayItems = groups[k];
    for (let i = 0; i < dayItems.length; i++) {
      const it = dayItems[i];
      if (isPlace(it)) {
        placeCount++;
        const p = it as Place;
        const tStart = p.detail?.start_time;
        const tEnd = p.detail?.end_time;
        let timeStr = '';
        if (tStart && tEnd) {
          const ts = String(tStart).split(' ')[1] || String(tStart);
          const te = String(tEnd).split(' ')[1] || String(tEnd);
          timeStr = ` (${ts} - ${te})`;
        } else if (tStart) {
          const ts = String(tStart).split(' ')[1] || String(tStart);
          timeStr = ` (${ts})`;
        }
        lines.push(`  - ${p.name}${timeStr}`);
        const addr = p.detail?.address?.name || p.detail?.address?.address;
        if (addr) lines.push(`      地址：${addr}`);
        if (p.detail?.description) lines.push(`      描述：${p.detail.description}`);
      } else if (isRouteSegment(it)) {
        const seg = it as RouteSegment;
        totalDistance += seg.distance || 0;
        totalDuration += seg.duration || 0;
        totalTolls += seg.tolls || 0;
        const distStr = formatDistance(seg.distance || 0);
        const durStr = formatDuration(seg.duration || 0);
        lines.push(`      -> ${translateMode(seg.travelMode)} ${distStr} ${durStr}${seg.tolls ? ` 费用 ${seg.tolls} 元` : ''}`);
      }
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(`总计：${placeCount} 个地点，${formatDistance(totalDistance)}，${formatDuration(totalDuration)}，${totalTolls} 元`);
  return lines.join('\n');
}

function translateMode(mode: string): string {
  switch (mode) {
    case 'walk': return '步行';
    case 'bicycle': return '骑行';
    case 'two_wheeler': return '摩托';
    case 'drive': return '驾车';
    case 'transit': return '公交';
    default: return mode;
  }
}

function formatDistance(meters: number): string {
  if (!isFinite(meters) || meters <= 0) return '0m';
  if (meters >= 1000) return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)}km`;
  return `${Math.round(meters)}m`;
}

function formatDuration(minutes: number): string {
  if (!isFinite(minutes) || minutes <= 0) return '0min';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  if (h > 0 && m > 0) return `${h}h${m}min`;
  if (h > 0) return `${h}h`;
  return `${m}min`;
}

/** 将本地时间（YYYY-MM-DD HH:mm:ss 或 YYYY-MM-DD）转为 UTC 的 ICS 格式 */
function toIcsUtc(datetime: string): string | null {
  if (!datetime) return null;
  const s = String(datetime).trim();
  // 如果只有日期，补 00:00:00
  const d = new Date(s.includes(' ') || s.includes('T') ? s : `${s} 00:00:00`);
  if (isNaN(d.getTime())) return null;
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  const HH = d.getUTCHours().toString().padStart(2, '0');
  const MM = d.getUTCMinutes().toString().padStart(2, '0');
  const SS = d.getUTCSeconds().toString().padStart(2, '0');
  return `${yyyy}${mm}${dd}T${HH}${MM}${SS}Z`;
}

/** 仅日期（整天事件），格式 YYYYMMDD */
function toIcsDate(datetime: string): string | null {
  if (!datetime) return null;
  const datePart = String(datetime).trim().split(' ')[0].split('T')[0];
  const d = new Date(`${datePart} 00:00:00`);
  if (isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear().toString().padStart(4, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function escIcs(text: string): string {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/** 按 75 字节折行（RFC 5545） */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    parts.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length > 0) parts.push(' ' + rest);
  return parts.join('\r\n');
}

/**
 * 生成 ICS 字符串。每个带 start_time 的地点一个 VEVENT。
 * 地点无时间的跳过。时区处理使用 UTC（DTSTART:YYYYMMDDTHHMMSSZ）。
 */
export function exportICS(roadmap: Roadmap): string {
  const lines: string[] = [];
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//LaC//Roadmap//CN');
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');

  const dtstamp = toIcsUtc(new Date().toISOString().replace('T', ' ').replace('Z', '')) || '19700101T000000Z';

  let uidCounter = 0;
  for (const it of roadmap.items) {
    if (!isPlace(it)) continue;
    const p = it as Place;
    const s = p.detail?.start_time;
    const e = p.detail?.end_time;
    if (!s && !e) continue; // 跳过无时间

    uidCounter++;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:lac-roadmap-${roadmap.id}-${uidCounter}-${Date.now()}@lac`);
    lines.push(`DTSTAMP:${dtstamp}`);

    // 判断是否为 all-day（仅日期，无时间部分）
    const hasTime = (v?: string) => !!v && /\d{1,2}:\d{2}/.test(String(v));
    if (!hasTime(s) && !hasTime(e)) {
      // all-day
      const ds = s ? toIcsDate(s) : (e ? toIcsDate(e) : null);
      if (ds) lines.push(`DTSTART;VALUE=DATE:${ds}`);
      const de = e ? toIcsDate(e) : ds;
      if (de) lines.push(`DTEND;VALUE=DATE:${de}`);
    } else {
      const ds = toIcsUtc(s || e!);
      if (ds) lines.push(`DTSTART:${ds}`);
      const de = toIcsUtc(e || s!);
      if (de) lines.push(`DTEND:${de}`);
    }

    lines.push(foldLine(`SUMMARY:${escIcs(p.name)}`));
    const descParts: string[] = [];
    if (p.detail?.description) descParts.push(p.detail.description);
    if (descParts.length) lines.push(foldLine(`DESCRIPTION:${escIcs(descParts.join('\n'))}`));
    const addr = p.detail?.address?.name || p.detail?.address?.address;
    if (addr) lines.push(foldLine(`LOCATION:${escIcs(addr)}`));
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * 生成 Markdown 行程单：可直接粘回 Obsidian 笔记或贴到聊天软件渲染。
 * 与纯文本相比，使用 H1/H2/H3 与列表语法，并把统计放在表格中。
 */
export function exportMarkdown(roadmap: Roadmap): string {
  const lines: string[] = [];
  lines.push(`# ${roadmap.name}`);
  const s = roadmap.detail?.start_time;
  const e = roadmap.detail?.end_time;
  if (s || e) {
    const sp = s ? String(s).split(' ')[0] : '';
    const ep = e ? String(e).split(' ')[0] : '';
    if (sp && ep && sp !== ep) lines.push(`*日期：${sp} ~ ${ep}*`);
    else lines.push(`*日期：${sp || ep}*`);
  }
  if (roadmap.detail?.description) {
    lines.push('');
    lines.push(`> ${roadmap.detail.description}`);
  }
  lines.push('');

  const groups: Record<string, Array<Place | RouteSegment>> = {};
  const keyOrder: string[] = [];
  let dayIndex = 1;
  let currentKey = '';
  for (let i = 0; i < roadmap.items.length; i++) {
    const it = roadmap.items[i];
    if (isPlace(it)) {
      const start = it.detail?.start_time;
      const key = start ? String(start).split(' ')[0] : `第${it.detail?.days ?? dayIndex}天`;
      if (key !== currentKey) {
        currentKey = key;
        if (!start) dayIndex++;
        if (!groups[key]) { groups[key] = []; keyOrder.push(key); }
      }
      groups[currentKey].push(it);
      const next = roadmap.items[i + 1];
      if (isRouteSegment(next)) groups[currentKey].push(next);
    }
  }

  let totalDistance = 0;
  let totalDuration = 0;
  let totalTolls = 0;
  let placeCount = 0;

  for (const k of keyOrder) {
    lines.push(`## ${k}`);
    const dayItems = groups[k];
    for (let i = 0; i < dayItems.length; i++) {
      const it = dayItems[i];
      if (isPlace(it)) {
        placeCount++;
        const tStart = it.detail?.start_time;
        const tEnd = it.detail?.end_time;
        let timeStr = '';
        if (tStart && tEnd) {
          const ts = String(tStart).split(' ')[1] || String(tStart);
          const te = String(tEnd).split(' ')[1] || String(tEnd);
          timeStr = ` *(${ts} – ${te})*`;
        } else if (tStart) {
          const ts = String(tStart).split(' ')[1] || String(tStart);
          timeStr = ` *(${ts})*`;
        }
        lines.push(`- **[[${it.name}]]**${timeStr}`);
        const addr = it.detail?.address?.name || it.detail?.address?.address;
        if (addr) lines.push(`  - 📍 ${addr}`);
        if (it.detail?.description) lines.push(`  - ${it.detail.description}`);
      } else if (isRouteSegment(it)) {
        totalDistance += it.distance || 0;
        totalDuration += it.duration || 0;
        totalTolls += it.tolls || 0;
        const distStr = formatDistance(it.distance || 0);
        const durStr = formatDuration(it.duration || 0);
        lines.push(`  - → ${translateMode(it.travelMode)} ${distStr} · ${durStr}${it.tolls ? ` · 费用 ${it.tolls} 元` : ''}`);
      }
    }
    lines.push('');
  }

  lines.push('## 总计');
  lines.push('');
  lines.push('| 指标 | 数值 |');
  lines.push('|---|---|');
  lines.push(`| 天数 | ${keyOrder.length} |`);
  lines.push(`| 地点数 | ${placeCount} |`);
  lines.push(`| 总距离 | ${formatDistance(totalDistance)} |`);
  lines.push(`| 总用时 | ${formatDuration(totalDuration)} |`);
  lines.push(`| 总费用 | ${totalTolls} 元 |`);
  return lines.join('\n');
}

function escXml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toGpxIso(datetime: string): string | null {
  if (!datetime) return null;
  const s = String(datetime).trim();
  const d = new Date(s.includes(' ') || s.includes('T') ? s : `${s} 00:00:00`);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * 生成 GPX 1.1 字符串。所有有坐标的地点导出为 <wpt>；同时把按顺序的地点写入一个 <trk>/<trkseg>。
 * 坐标统一使用 WGS84（GPX 标准要求），GCJ-02 坐标会先转换。
 */
export function exportGpx(roadmap: Roadmap): string {
  // 延迟引入坐标转换，避免循环依赖
  const { CoordinateConverter } = require('../components/map/GoogleMap') as typeof import('../components/map/GoogleMap');
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push('<gpx version="1.1" creator="LaC.Roadmap" xmlns="http://www.topografix.com/GPX/1/1">');
  out.push(`  <metadata>`);
  out.push(`    <name>${escXml(roadmap.name)}</name>`);
  if (roadmap.detail?.description) out.push(`    <desc>${escXml(roadmap.detail.description)}</desc>`);
  const stamp = new Date().toISOString();
  out.push(`    <time>${stamp}</time>`);
  out.push(`  </metadata>`);

  const places: Array<{ p: Place; lng: number; lat: number }> = [];
  for (const it of roadmap.items) {
    if (!isPlace(it)) continue;
    const a = it.detail?.address;
    if (!a || a.longitude == null || a.latitude == null) continue;
    let lng = a.longitude;
    let lat = a.latitude;
    const sys = (a.coordinate_system || 'WGS84').toLowerCase();
    if (sys === 'gcj-02' || sys === 'gcj02') {
      [lng, lat] = CoordinateConverter.gcj02ToWgs84(lng, lat);
    }
    places.push({ p: it, lng, lat });
  }

  for (const { p, lng, lat } of places) {
    out.push(`  <wpt lat="${lat}" lon="${lng}">`);
    out.push(`    <name>${escXml(p.name)}</name>`);
    const desc = p.detail?.description;
    if (desc) out.push(`    <desc>${escXml(desc)}</desc>`);
    const t = toGpxIso(p.detail?.start_time || '');
    if (t) out.push(`    <time>${t}</time>`);
    out.push(`  </wpt>`);
  }

  if (places.length >= 2) {
    out.push(`  <trk>`);
    out.push(`    <name>${escXml(roadmap.name)}</name>`);
    out.push(`    <trkseg>`);
    for (const { p, lng, lat } of places) {
      const t = toGpxIso(p.detail?.start_time || '');
      out.push(`      <trkpt lat="${lat}" lon="${lng}">`);
      out.push(`        <name>${escXml(p.name)}</name>`);
      if (t) out.push(`        <time>${t}</time>`);
      out.push(`      </trkpt>`);
    }
    out.push(`    </trkseg>`);
    out.push(`  </trk>`);
  }

  out.push('</gpx>');
  return out.join('\n');
}
