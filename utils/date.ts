// 日期工具函数：从 CardCalendar 与 roadmapset 中抽出的重复函数
// 保持原有行为一致，允许两种解析策略（严格 / 宽松）

/** 以 00:00:00.000 起点取日 */
export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** 周一为起点的一周的起点 */
export function startOfWeekMonday(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay(); // 0..6 (Sun..Sat)
  const offset = (day + 6) % 7; // Mon(1)->0, ..., Sun(0)->6
  x.setDate(x.getDate() - offset);
  return x;
}

/** 周日为结尾的一周的结尾（同周） */
export function endOfWeekSunday(d: Date): Date {
  const s = startOfWeekMonday(d);
  s.setDate(s.getDate() + 6);
  return s;
}

/** 格式化为 YYYY-MM-DD */
export function formatYMD(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const da = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${da}`;
}

/**
 * 解析形如 "YYYY-M-D [HH[:MM[:SS]]]" 的字符串。
 * 严格模式优先（CardCalendar 行为），宽松模式作为回退。
 * 解析失败返回 null。
 */
export function parseDateOrNull(s?: string): Date | null {
  if (!s) return null;
  const raw = s.trim();
  // 严格：支持 1-2 位月日 与可选 T/空格分隔的时间
  const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Math.max(1, Math.min(12, Number(m[2]))) - 1;
    const da = Math.max(1, Math.min(31, Number(m[3])));
    const hh = m[4] ? Number(m[4]) : 0;
    const mi = m[5] ? Number(m[5]) : 0;
    const ss = m[6] ? Number(m[6]) : 0;
    const d = new Date(y, mo, da, hh, mi, ss);
    if (!isNaN(d.getTime())) return d;
  }
  // 宽松：空格 -> T 后交给 Date 解析
  let iso = raw;
  if (iso.indexOf(' ') > 0 && iso.indexOf('T') === -1) iso = iso.replace(' ', 'T');
  const t = new Date(iso);
  if (!isNaN(t.getTime())) return t;
  return null;
}

/** 判断 key 是否为 YYYY-MM-DD 格式 */
export function isDateKey(k: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(k);
}

/**
 * 路线图分组 key 的排序比较：日期在前（升序），"第N天" 在后（数值升序）
 */
export function compareGroupKey(a: string, b: string): number {
  const aIsDate = isDateKey(a);
  const bIsDate = isDateKey(b);
  if (aIsDate && bIsDate) return a.localeCompare(b);
  if (!aIsDate && !bIsDate) {
    const na = parseInt(a.replace(/第|天/g, ''), 10) || 0;
    const nb = parseInt(b.replace(/第|天/g, ''), 10) || 0;
    return na - nb;
  }
  return aIsDate ? -1 : 1;
}
