// LaC.Roadmap — Field Journal redesign artboards
// All artboards share width 460 (Obsidian side-panel-ish). Heights vary.

const { useMemo } = React;

/* -------------------------------------------------------------------------- */
/*  Shared helpers                                                            */
/* -------------------------------------------------------------------------- */

const StatusDot = ({ kind }) => <span className={`lac-dot lac-dot--${kind}`} />;

const Stat = ({ label, value, unit }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
    <div className="lac-eyebrow">{label}</div>
    <div style={{ display: "baseline", display: "flex", gap: 3, alignItems: "baseline" }}>
      <span className="lac-serif" style={{ fontSize: 22, fontWeight: 400, letterSpacing: "-0.01em", color: "var(--text-1)" }}>{value}</span>
      {unit && <span className="lac-mono" style={{ fontSize: 10, color: "var(--text-3)" }}>{unit}</span>}
    </div>
  </div>
);

/* Refined heatmap — monochromatic gold density, square cells, 7-row */
function HeatmapStrip({ days, cols = 22, cell = 8, gap = 2 }) {
  // days: array of day objects { count, inRange }
  const rows = 7;
  const w = cols * (cell + gap) - gap;
  const h = rows * (cell + gap) - gap;
  const heatColor = (d) => {
    if (!d.inRange && !d.count) return "var(--heat-bg)";
    if (!d.count) return "var(--heat-empty)";
    if (d.count >= 5) return "var(--heat-5)";
    if (d.count >= 4) return "var(--heat-4)";
    if (d.count >= 3) return "var(--heat-3)";
    if (d.count >= 2) return "var(--heat-2)";
    return "var(--heat-1)";
  };
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      {days.slice(0, rows * cols).map((d, i) => {
        const col = Math.floor(i / rows);
        const row = i % rows;
        return (
          <rect
            key={i}
            x={col * (cell + gap)}
            y={row * (cell + gap)}
            width={cell}
            height={cell}
            rx={1.5}
            fill={heatColor(d)}
          />
        );
      })}
    </svg>
  );
}

/* Pseudo-random heatmap data for mock */
function genDays(cols, fillStart, fillEnd, density = 1) {
  const rows = 7;
  const total = cols * rows;
  const arr = [];
  // simple deterministic noise
  let seed = 7;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < total; i++) {
    const inRange = i >= fillStart && i <= fillEnd;
    let count = 0;
    if (inRange) {
      const r = rnd();
      if (r < 0.45 * density) count = 1 + Math.floor(rnd() * 4);
    }
    arr.push({ count, inRange });
  }
  return arr;
}

/* Striped image-slot placeholder w/ label */
const Placeholder = ({ label, w, h, style }) => (
  <div className="lac-placeholder" style={{ width: w, height: h, ...style }}>
    {label}
  </div>
);

/* Travel-mode glyph — minimal mono characters, no SVG illustrations */
const ModeGlyph = ({ mode }) => {
  const map = { walk: "step", bicycle: "bike", drive: "car", transit: "train", two_wheeler: "moto" };
  return <span className="lac-mono" style={{ fontSize: 9, letterSpacing: "0.08em", color: "var(--text-3)" }}>{map[mode] || mode}</span>;
};

/* -------------------------------------------------------------------------- */
/*  Artboard 1 — Trip List (RoadmapSet)                                       */
/* -------------------------------------------------------------------------- */

function RoadmapSetArtboard() {
  const trips = [
    {
      name: "京都奈良两日",
      desc: "伏见稻荷 · 东大寺 · 鹿",
      range: "2025·11·01 → 11·02",
      status: "plan",
      places: 4,
      km: 81.3,
      heat: genDays(22, 110, 113, 1.4),
    },
    {
      name: "成都美食两日",
      desc: "宽窄巷子 · 春熙路",
      range: "2025·09·14 → 09·15",
      status: "done",
      places: 7,
      km: 24.6,
      heat: genDays(22, 70, 71, 2),
    },
    {
      name: "日本之行",
      desc: "东京 → 京都 → 大阪",
      range: "2025·05·02 → 05·12",
      status: "done",
      places: 23,
      km: 612.0,
      heat: genDays(22, 30, 50, 1.8),
    },
    {
      name: "未计划周末",
      desc: "随机想去的地方",
      range: "—",
      status: "wish",
      places: 9,
      km: null,
      heat: genDays(22, -1, -1, 0),
    },
  ];

  return (
    <div className="lac-stage" style={{ width: 460, padding: "0", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "20px 20px 14px" }}>
        <div className="lac-eyebrow" style={{ marginBottom: 6 }}>LaC · Roadmap</div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <h1 className="lac-serif" style={{ fontSize: 24, fontWeight: 400, letterSpacing: "-0.015em", margin: 0, color: "var(--text-1)" }}>
            行程
          </h1>
          <span className="lac-mono" style={{ fontSize: 11, color: "var(--text-3)" }}>12 trips</span>
        </div>
        {/* one-line stat strip — replaces 5-up dashboard cards */}
        <div className="lac-mono" style={{ fontSize: 11, color: "var(--text-3)", marginTop: 8, letterSpacing: "0.02em" }}>
          <span style={{ color: "var(--done)" }}>4 done</span>
          <span style={{ color: "var(--text-4)", margin: "0 8px" }}>·</span>
          <span style={{ color: "var(--plan)" }}>3 planning</span>
          <span style={{ color: "var(--text-4)", margin: "0 8px" }}>·</span>
          <span style={{ color: "var(--wish)" }}>5 wishlist</span>
          <span style={{ color: "var(--text-4)", margin: "0 8px" }}>·</span>
          <span>97 places</span>
        </div>
      </div>

      {/* Hero aggregated map */}
      <div style={{ padding: "0 20px" }}>
        <Placeholder label="aggregated · all trips" w="100%" h={150} style={{ borderRadius: 12 }} />
      </div>

      {/* Section labels */}
      <div style={{ padding: "20px 20px 8px", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div className="lac-eyebrow">未安排 · wishlist</div>
        <div className="lac-mono" style={{ fontSize: 10, color: "var(--text-4)" }}>drag to reorder</div>
      </div>

      {/* Wishlist trip card */}
      <div style={{ padding: "0 20px 8px" }}>
        <TripCard trip={trips[3]} compact />
      </div>

      <div style={{ padding: "20px 20px 8px" }}>
        <div className="lac-eyebrow">已规划 · planned</div>
      </div>

      {/* Planned trip cards */}
      <div style={{ padding: "0 20px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
        <TripCard trip={trips[0]} />
        <TripCard trip={trips[1]} />
        <TripCard trip={trips[2]} />
      </div>

      {/* New trip — minimal full-width row, no big floating button */}
      <div style={{ padding: "12px 20px 24px" }}>
        <button
          style={{
            width: "100%",
            background: "transparent",
            border: "1px dashed var(--hairline-strong)",
            borderRadius: 10,
            padding: "12px",
            color: "var(--text-3)",
            fontFamily: "var(--mono)",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          + new trip
        </button>
      </div>
    </div>
  );
}

function TripCard({ trip, compact }) {
  const colorByStatus = { done: "var(--done)", plan: "var(--plan)", wish: "var(--wish)" };
  return (
    <div className="lac-card2" style={{ padding: 0 }}>
      {/* Top row */}
      <div style={{ padding: "14px 14px 10px", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <StatusDot kind={trip.status} />
            <span
              className="lac-serif"
              style={{ fontSize: 17, fontWeight: 400, letterSpacing: "-0.01em", color: colorByStatus[trip.status], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {trip.name}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 6 }}>{trip.desc}</div>
          <div className="lac-mono" style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.04em" }}>
            {trip.range}
            {trip.km !== null && (
              <>
                <span style={{ color: "var(--text-4)", margin: "0 6px" }}>·</span>
                {trip.places} places
                <span style={{ color: "var(--text-4)", margin: "0 6px" }}>·</span>
                {trip.km} km
              </>
            )}
            {trip.km === null && (
              <>
                <span style={{ color: "var(--text-4)", margin: "0 6px" }}>·</span>
                {trip.places} places
              </>
            )}
          </div>
        </div>

        {/* Right thumbnail — small + circular, not 100×100 square block */}
        <Placeholder label="map" w={56} h={56} style={{ borderRadius: 10, fontSize: 8, flexShrink: 0 }} />
      </div>

      {/* Heatmap band */}
      {!compact && (
        <div style={{ padding: "0 14px 12px" }}>
          <HeatmapStrip days={trip.heat} cols={22} cell={9} gap={2} />
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Artboard 2 — Trip Detail (Roadmap, with timeline)                         */
/* -------------------------------------------------------------------------- */

function RoadmapArtboard() {
  const places = [
    {
      name: "京都站",
      time: "11·01 · 09:00 → 09:30",
      desc: "新干线抵达，寄存行李",
      day: "DAY 1",
      dayKey: "2025-11-01",
    },
    {
      name: "伏见稻荷",
      time: "10:00 → 12:30",
      desc: "千本鸟居，稻荷山徒步",
      day: null,
      dayKey: "2025-11-01",
      route: { mode: "transit", km: "4.8", min: "18", toll: 240 },
    },
    {
      name: "东大寺",
      time: "14:00 → 16:00",
      desc: "大佛殿、二月堂俯瞰",
      day: null,
      dayKey: "2025-11-01",
      route: { mode: "walk", km: "34.5", min: "482", toll: 0 },
    },
    {
      name: "奈良公园",
      time: "11·02 · 10:00 → 14:00",
      desc: "鹿、春日大社",
      day: "DAY 2",
      dayKey: "2025-11-02",
      route: { mode: "transit", km: "42.0", min: "55", toll: 0 },
    },
  ];

  const dayKeys = [
    { key: "2025-11-01", label: "11·01", n: "1", count: 3, active: true },
    { key: "2025-11-02", label: "11·02", n: "2", count: 1, active: true },
    { key: "未计划",     label: "wishlist", n: "•", count: 2, active: false },
  ];

  return (
    <div className="lac-stage" style={{ width: 460 }}>
      {/* Header */}
      <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--hairline)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <button
            style={{
              background: "transparent",
              border: "1px solid var(--hairline-strong)",
              color: "var(--text-2)",
              borderRadius: 6,
              width: 24,
              height: 24,
              padding: 0,
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "var(--mono)",
            }}
          >
            ‹
          </button>
          <div className="lac-eyebrow">trip</div>
        </div>

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <h1 className="lac-serif" style={{ fontSize: 26, fontWeight: 400, letterSpacing: "-0.015em", margin: 0, color: "var(--plan)" }}>
            京都奈良两日
          </h1>
          <span className="lac-mono" style={{ fontSize: 10, color: "var(--text-3)", whiteSpace: "nowrap" }}>
            11·01 → 11·02
          </span>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 6, fontStyle: "italic", fontFamily: "var(--serif)" }}>
          京都伏见稻荷 + 奈良公园东大寺两日游
        </div>

        {/* Single-line stat strip — replaces five generic cards */}
        <div className="lac-mono" style={{ fontSize: 11, color: "var(--text-2)", marginTop: 14, letterSpacing: "0.02em", display: "flex", flexWrap: "wrap", gap: 12 }}>
          <span><span style={{ color: "var(--text-1)" }}>2</span><span style={{ color: "var(--text-4)" }}> days</span></span>
          <span style={{ color: "var(--text-4)" }}>·</span>
          <span><span style={{ color: "var(--text-1)" }}>4</span><span style={{ color: "var(--text-4)" }}> places</span></span>
          <span style={{ color: "var(--text-4)" }}>·</span>
          <span><span style={{ color: "var(--text-1)" }}>81.3</span><span style={{ color: "var(--text-4)" }}> km</span></span>
          <span style={{ color: "var(--text-4)" }}>·</span>
          <span><span style={{ color: "var(--text-1)" }}>9h 15m</span></span>
          <span style={{ color: "var(--text-4)" }}>·</span>
          <span><span style={{ color: "var(--text-1)" }}>¥240</span></span>
        </div>
      </div>

      {/* Hero aggregated map */}
      <div style={{ padding: "12px 20px 0" }}>
        <Placeholder label="aggregated · trip route" w="100%" h={180} style={{ borderRadius: 12 }} />
      </div>

      {/* Day tabs — quiet, typographic, NOT browser tabs */}
      <div style={{ padding: "16px 20px 4px", display: "flex", gap: 4, alignItems: "flex-end", overflowX: "auto" }}>
        {dayKeys.map((d) => (
          <DayTab key={d.key} {...d} />
        ))}
        <button
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-3)",
            fontFamily: "var(--mono)",
            fontSize: 12,
            cursor: "pointer",
            padding: "6px 8px",
            marginLeft: "auto",
          }}
        >
          + day
        </button>
      </div>

      {/* Timeline */}
      <div style={{ padding: "12px 20px 24px" }}>
        <Timeline places={places} />
      </div>

      {/* Floating add — quiet text button bottom-right */}
      <div style={{ padding: "0 20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <button
          style={{
            flex: 1,
            background: "transparent",
            border: "1px dashed var(--hairline-strong)",
            borderRadius: 10,
            padding: "10px",
            color: "var(--text-3)",
            fontFamily: "var(--mono)",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          + add place
        </button>
        <button
          style={{
            background: "transparent",
            border: "1px solid var(--hairline-strong)",
            borderRadius: 10,
            padding: "10px 12px",
            color: "var(--text-3)",
            fontFamily: "var(--mono)",
            fontSize: 11,
            letterSpacing: "0.12em",
            cursor: "pointer",
          }}
        >
          ↓ export
        </button>
      </div>
    </div>
  );
}

function DayTab({ label, n, count, active }) {
  return (
    <div
      style={{
        padding: "6px 10px 8px",
        borderBottom: active ? "1.5px solid var(--plan)" : "1px solid transparent",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        minWidth: 56,
      }}
    >
      <div className="lac-mono" style={{ fontSize: 9, color: "var(--text-3)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        DAY {n}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span className="lac-mono" style={{ fontSize: 12, color: active ? "var(--text-1)" : "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>{label}</span>
        <span className="lac-mono" style={{ fontSize: 9, color: "var(--text-4)" }}>{count}</span>
      </div>
    </div>
  );
}

function Timeline({ places }) {
  return (
    <div style={{ position: "relative", paddingLeft: 28 }}>
      {/* Continuous spine */}
      <div
        style={{
          position: "absolute",
          left: 9,
          top: 8,
          bottom: 8,
          width: 1,
          background: "var(--hairline-strong)",
        }}
      />
      {places.map((p, i) => (
        <PlaceItem key={i} idx={i + 1} place={p} isLast={i === places.length - 1} showDay={!!p.day} />
      ))}
    </div>
  );
}

function PlaceItem({ idx, place, isLast, showDay }) {
  return (
    <div style={{ position: "relative", paddingBottom: isLast ? 0 : 18 }}>
      {/* Day marker */}
      {showDay && (
        <div
          className="lac-eyebrow"
          style={{ marginLeft: -4, marginBottom: 10, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 8 }}
        >
          <span style={{ width: 18, height: 1, background: "var(--hairline-strong)", display: "inline-block", marginLeft: -22 }} />
          {place.day}
        </div>
      )}

      {/* Number bullet on spine */}
      <div
        style={{
          position: "absolute",
          left: -28,
          top: showDay ? 0 : 2,
          width: 19,
          height: 19,
          borderRadius: "50%",
          background: "var(--surface-2)",
          border: "1px solid var(--hairline-strong)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--mono)",
          fontSize: 10,
          color: "var(--text-2)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {idx}
      </div>

      {/* Place body */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="lac-serif" style={{ fontSize: 16, fontWeight: 400, letterSpacing: "-0.005em", color: "var(--text-1)", marginBottom: 2 }}>
            {place.name}
          </div>
          <div className="lac-mono" style={{ fontSize: 10, color: "var(--done)", letterSpacing: "0.04em", marginBottom: 4 }}>
            {place.time}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.45 }}>
            {place.desc}
          </div>
        </div>
        <Placeholder label="here" w={52} h={52} style={{ borderRadius: 8, fontSize: 8, flexShrink: 0 }} />
      </div>

      {/* Route segment chip — sits between places, on the spine */}
      {!isLast && <RouteChip />}
    </div>
  );
}

function RouteChip() {
  return (
    <div style={{ position: "relative", marginTop: 10, marginLeft: -4, marginBottom: -8 }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "3px 8px",
          background: "var(--surface-2)",
          border: "1px solid var(--hairline)",
          borderRadius: 999,
          fontFamily: "var(--mono)",
          fontSize: 9,
          letterSpacing: "0.06em",
          color: "var(--text-3)",
          marginLeft: -16,
        }}
      >
        <span style={{ color: "var(--plan)" }}>transit</span>
        <span style={{ color: "var(--text-4)" }}>·</span>
        <span>4.8 km</span>
        <span style={{ color: "var(--text-4)" }}>·</span>
        <span>18 min</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Artboard 3 — Place Edit Modal                                             */
/* -------------------------------------------------------------------------- */

function PlaceEditArtboard() {
  return (
    <div className="lac-stage" style={{ width: 460, padding: 0 }}>
      <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid var(--hairline)" }}>
        <div className="lac-eyebrow" style={{ marginBottom: 6 }}>edit place</div>
        <h2 className="lac-serif" style={{ margin: 0, fontSize: 22, fontWeight: 400, letterSpacing: "-0.01em", color: "var(--text-1)" }}>
          伏见稻荷
        </h2>
      </div>

      <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
        <Field label="name">
          <input
            defaultValue="伏见稻荷"
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              borderBottom: "1px solid var(--hairline-strong)",
              color: "var(--text-1)",
              fontFamily: "var(--serif)",
              fontSize: 18,
              padding: "4px 0",
              outline: "none",
            }}
          />
        </Field>

        <Field label="when">
          <div style={{ display: "flex", gap: 10, fontFamily: "var(--mono)", color: "var(--text-1)", fontSize: 13 }}>
            <span style={{ color: "var(--text-3)" }}>2025-11-01</span>
            <span style={{ color: "var(--text-1)" }}>10:00</span>
            <span style={{ color: "var(--text-4)" }}>→</span>
            <span style={{ color: "var(--text-3)" }}>2025-11-01</span>
            <span style={{ color: "var(--text-1)" }}>12:30</span>
          </div>
        </Field>

        <Field label="where" sub="GCJ-02 → WGS84">
          <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
            <div style={{ flex: 1, fontFamily: "var(--sans)", fontSize: 13, color: "var(--text-1)", padding: "8px 0", borderBottom: "1px solid var(--hairline-strong)" }}>
              伏见稻荷大社
              <div className="lac-mono" style={{ fontSize: 10, color: "var(--text-3)", marginTop: 3, letterSpacing: "0.04em" }}>
                34.9671°N · 135.7727°E
              </div>
            </div>
            <Placeholder label="map" w={64} h={64} style={{ borderRadius: 8, fontSize: 8 }} />
          </div>
        </Field>

        <Field label="notes">
          <textarea
            defaultValue="伏见稻荷大社、千本鸟居"
            rows={3}
            style={{
              width: "100%",
              background: "transparent",
              border: "1px solid var(--hairline)",
              borderRadius: 8,
              color: "var(--text-1)",
              fontFamily: "var(--serif)",
              fontStyle: "italic",
              fontSize: 14,
              padding: 10,
              resize: "none",
              outline: "none",
            }}
          />
        </Field>
      </div>

      <div style={{ padding: "12px 20px 20px", display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--hairline)" }}>
        <button
          style={{
            background: "transparent",
            border: "none",
            color: "var(--danger)",
            fontFamily: "var(--mono)",
            fontSize: 11,
            letterSpacing: "0.12em",
            cursor: "pointer",
            padding: "8px 0",
          }}
        >
          delete
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            style={{
              background: "transparent",
              border: "1px solid var(--hairline-strong)",
              color: "var(--text-2)",
              fontFamily: "var(--mono)",
              fontSize: 11,
              letterSpacing: "0.1em",
              padding: "8px 14px",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            cancel
          </button>
          <button
            style={{
              background: "var(--plan)",
              border: "1px solid var(--plan)",
              color: "var(--ink)",
              fontFamily: "var(--mono)",
              fontSize: 11,
              letterSpacing: "0.1em",
              padding: "8px 16px",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, sub, children }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <div className="lac-eyebrow">{label}</div>
        {sub && <div className="lac-mono" style={{ fontSize: 9, color: "var(--text-4)", letterSpacing: "0.06em" }}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Comparison artboard — old vs new heatmap & card                            */
/* -------------------------------------------------------------------------- */

function ComparisonArtboard() {
  return (
    <div className="lac-stage" style={{ width: 460, padding: "20px 20px 24px" }}>
      <div className="lac-eyebrow" style={{ marginBottom: 14 }}>before / after</div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 8, fontFamily: "var(--serif)", fontStyle: "italic" }}>
          Heatmap — rainbow (old) vs monochromatic gold (new)
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ background: "var(--surface-1)", padding: 10, borderRadius: 8, border: "1px solid var(--hairline)" }}>
            <div className="lac-mono" style={{ fontSize: 9, color: "var(--text-4)", marginBottom: 6 }}>OLD</div>
            <OldHeatmap />
          </div>
          <div style={{ background: "var(--surface-1)", padding: 10, borderRadius: 8, border: "1px solid var(--hairline)" }}>
            <div className="lac-mono" style={{ fontSize: 9, color: "var(--done)", marginBottom: 6 }}>NEW</div>
            <HeatmapStrip days={genDays(28, 2, 24, 1.4)} cols={28} cell={9} gap={2} />
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 8, fontFamily: "var(--serif)", fontStyle: "italic" }}>
          Stats — 5-card dashboard (old) vs typographic line (new)
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ background: "var(--surface-1)", padding: 10, borderRadius: 8, border: "1px solid var(--hairline)" }}>
            <div className="lac-mono" style={{ fontSize: 9, color: "var(--text-4)", marginBottom: 8 }}>OLD</div>
            <OldStats />
          </div>
          <div style={{ background: "var(--surface-1)", padding: 10, borderRadius: 8, border: "1px solid var(--hairline)" }}>
            <div className="lac-mono" style={{ fontSize: 9, color: "var(--done)", marginBottom: 8 }}>NEW</div>
            <div className="lac-mono" style={{ fontSize: 11, color: "var(--text-2)", letterSpacing: "0.02em", display: "flex", flexWrap: "wrap", gap: 12 }}>
              <span><span style={{ color: "var(--text-1)" }}>2</span><span style={{ color: "var(--text-4)" }}> days</span></span>
              <span style={{ color: "var(--text-4)" }}>·</span>
              <span><span style={{ color: "var(--text-1)" }}>4</span><span style={{ color: "var(--text-4)" }}> places</span></span>
              <span style={{ color: "var(--text-4)" }}>·</span>
              <span><span style={{ color: "var(--text-1)" }}>81.3</span><span style={{ color: "var(--text-4)" }}> km</span></span>
              <span style={{ color: "var(--text-4)" }}>·</span>
              <span><span style={{ color: "var(--text-1)" }}>9h 15m</span></span>
              <span style={{ color: "var(--text-4)" }}>·</span>
              <span><span style={{ color: "var(--text-1)" }}>¥240</span></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OldHeatmap() {
  // Recreate the rainbow heatmap that's currently in CardCalendar.tsx
  const cols = 28;
  const rows = 7;
  const cell = 9;
  const gap = 2;
  const w = cols * (cell + gap) - gap;
  const h = rows * (cell + gap) - gap;
  let seed = 13;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const rainbow = (cnt) => {
    if (cnt <= 0) return "#4b4b4b";
    const t = Math.min(cnt, 11) / 11;
    if (t < 0.5) {
      const k = t * 2;
      const r = Math.round(0 + (255 - 0) * k);
      const g = 255;
      return `rgb(${r}, ${g}, 0)`;
    } else {
      const k = (t - 0.5) * 2;
      const r = 255;
      const g = Math.round(255 + (0 - 255) * k);
      return `rgb(${r}, ${g}, 0)`;
    }
  };
  const rects = [];
  for (let i = 0; i < cols * rows; i++) {
    const inRange = i >= 14 && i <= 168;
    const r = rnd();
    const cnt = inRange && r < 0.45 ? 1 + Math.floor(rnd() * 9) : 0;
    rects.push({ x: Math.floor(i / rows) * (cell + gap), y: (i % rows) * (cell + gap), cnt, inRange });
  }
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      {rects.map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={cell}
          height={cell}
          rx={1}
          fill={r.cnt > 0 ? rainbow(r.cnt) : r.inRange ? "#4b4b4b" : "#000"}
          fillOpacity={r.cnt > 0 ? 1 : r.inRange ? 1 : 0.1}
        />
      ))}
    </svg>
  );
}

function OldStats() {
  const stats = [
    ["总天数", "2"],
    ["地点数", "4"],
    ["总距离", "81.3 km"],
    ["总用时", "9 h 15 min"],
    ["总费用", "¥240"],
  ];
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {stats.map(([l, v]) => (
        <div
          key={l}
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(128,128,128,0.2)",
            borderRadius: 6,
            padding: "6px 4px",
            textAlign: "center",
            fontFamily: "var(--sans)",
          }}
        >
          <div style={{ fontSize: 9, opacity: 0.7 }}>{l}</div>
          <div style={{ fontSize: 11, fontWeight: 600, marginTop: 1 }}>{v}</div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Mount                                                                      */
/* -------------------------------------------------------------------------- */

function App() {
  return (
    <DesignCanvas
      title="LaC.Roadmap · Field Journal redesign"
      subtitle="Typography-led, monochromatic gold, real timeline. Drop the rainbow heatmap, drop the 5-card dashboard, drop the browser-tabs."
    >
      <DCSection id="pages" title="Pages">
        <DCArtboard id="set" label="Trip List · 行程" width={460} height={1240}>
          <RoadmapSetArtboard />
        </DCArtboard>
        <DCArtboard id="trip" label="Trip Detail · 京都奈良两日" width={460} height={1180}>
          <RoadmapArtboard />
        </DCArtboard>
        <DCArtboard id="modal" label="Edit Place" width={460} height={580}>
          <PlaceEditArtboard />
        </DCArtboard>
      </DCSection>
      <DCSection id="why" title="Why this is more elegant">
        <DCArtboard id="compare" label="Before / After" width={460} height={520}>
          <ComparisonArtboard />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
