import { useState, useMemo } from "react";
import { parseTime } from "./auditLogic";
import EditPopover from "./EditPopover.jsx";

// ─── SUBJECT COLOR MAP ───────────────────────────────────────────────────────
// Add / adjust subjects and colors here as needed
const SUBJECT_COLORS = {
  MKTG: { bg: "#8B0000", text: "#fff", label: "Marketing" },
  BNAL: { bg: "#1565C0", text: "#fff", label: "Business Analytics" },
  ACCT: { bg: "#006064", text: "#fff", label: "Accounting" },
  FINA: { bg: "#1B5E20", text: "#fff", label: "Finance" },
  MGMT: { bg: "#4A148C", text: "#fff", label: "Management" },
  BUAD: { bg: "#004E38", text: "#fff", label: "Business Admin" },
  IBUS: { bg: "#BF360C", text: "#fff", label: "Intl. Business" },
  ENTR: { bg: "#B79257", text: "#fff", label: "Entrepreneurship" },
  OPER: { bg: "#1A237E", text: "#fff", label: "Operations" },
  SCM:  { bg: "#004D40", text: "#fff", label: "Supply Chain" },
  MBA:  { bg: "#37474F", text: "#fff", label: "MBA" },
};
const DEFAULT_COLOR = { bg: "#546E7A", text: "#fff", label: "Other" };

function getColor(subject) {
  return SUBJECT_COLORS[String(subject || "").trim().toUpperCase()] || DEFAULT_COLOR;
}

function formatTime(min) {
  if (min === null || min === undefined) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function normDays(days) {
  return String(days || "").replace(/\s/g, "").toUpperCase();
}

function getDayTab(days) {
  const d = normDays(days);
  if (d === "MWF") return "MWF";
  if (d === "MW")  return "MW";
  if (d === "TR" || d === "TH" || d === "RT") return "TR";
  if (d === "F")   return "F";
  // Fuzzy fallback
  const hasM = d.includes("M"), hasW = d.includes("W"),
        hasF = d.includes("F"), hasT = d.includes("T"), hasR = d.includes("R");
  if (hasM && hasW && hasF) return "MWF";
  if (hasM && hasW)         return "MW";
  if ((hasT || hasR) && !hasM && !hasW) return "TR";
  return "OTHER";
}

const DAY_TABS = [
  { key: "MW",    label: "Mon / Wed" },
  { key: "TR",    label: "Tue / Thu" },
  { key: "MWF",   label: "Mon / Wed / Fri" },
  { key: "F",     label: "Friday" },
  { key: "OTHER", label: "Other" },
];

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export default function ScheduleGrid({ schedule, onUpdateRow, onAddRow }) {
  const [activeDay, setActiveDay]         = useState(null);
  const [hoveredCourse, setHoveredCourse] = useState(null);
  const [mouse, setMouse]                 = useState({ x: 0, y: 0 });
  const [editCourse, setEditCourse]       = useState(null);

  // ── Parse rows
  const parsed = useMemo(() =>
    schedule.map((row, idx) => {
      const [start, end] = parseTime(row["Timeslot 1"] || row["Time"] || "");
      const days       = normDays(row["Days 1"] ?? row["Days"] ?? "");
      const room       = String(row["Room"]        || "").trim();
      const subject    = String(row["Subject"]     || "").trim().toUpperCase();
      const courseNo   = String(row["Course No"]   || "").trim();
      const section    = String(row["Section"]     || "").trim();
      const title      = String(row["Title"] || row["Course Title"] || "").trim();
      const instructor = String(row["Instr Last"]  ?? row["Instructor"] ?? "").trim();
      const enrolled   = Number(row["Adj. Enrl"]   ?? row["Enrolled"]   ?? 0);
      const capacity   = Number(row["Room Cap"]    ?? row["Capacity"]   ?? 0);
      const crn        = String(row["CRN"]         || "").trim();
      const dayTab     = getDayTab(days);
      return { idx, start, end, days, dayTab, room, subject, courseNo, section, title, instructor, enrolled, capacity, crn };
    }), [schedule]);

  // ── Count schedulable rows per tab (has time + real room)
  const tabCounts = useMemo(() => {
    const c = {};
    DAY_TABS.forEach(t => { c[t.key] = 0; });
    parsed.forEach(r => {
      if (r.start !== null && r.room && r.room !== "-" && r.room.toLowerCase() !== "tba")
        c[r.dayTab] = (c[r.dayTab] || 0) + 1;
    });
    return c;
  }, [parsed]);

  const visibleTabs = DAY_TABS.filter(t => tabCounts[t.key] > 0);
  const currentDay  = (activeDay && tabCounts[activeDay] > 0) ? activeDay : (visibleTabs[0]?.key || "MW");

  // ── Rows for active day
  const dayRows = useMemo(() =>
    parsed.filter(r => r.start !== null && r.room && r.room !== "-" &&
                       r.room.toLowerCase() !== "tba" && r.dayTab === currentDay),
    [parsed, currentDay]);

  // ── Unique sorted time slots
  const timeSlots = useMemo(() => {
    const map = new Map();
    dayRows.forEach(r => {
      const k = `${r.start}-${r.end}`;
      if (!map.has(k)) map.set(k, { start: r.start, end: r.end, key: k });
    });
    return [...map.values()].sort((a, b) => a.start - b.start);
  }, [dayRows]);

  // ── Unique sorted rooms
  const rooms = useMemo(() => {
    const set = new Set(dayRows.map(r => r.room));
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [dayRows]);

  // ── Grid  slotKey → room → [rows]
  const grid = useMemo(() => {
    const g = {};
    timeSlots.forEach(ts => {
      g[ts.key] = {};
      rooms.forEach(rm => { g[ts.key][rm] = []; });
    });
    dayRows.forEach(row => {
      const k = `${row.start}-${row.end}`;
      if (g[k]?.[row.room] !== undefined) g[k][row.room].push(row);
    });
    return g;
  }, [dayRows, timeSlots, rooms]);

  // ── Subjects present in this view (for legend)
  const presentSubjects = useMemo(() => {
    const set = new Set(dayRows.map(r => r.subject).filter(Boolean));
    return [...set].sort();
  }, [dayRows]);

  if (!visibleTabs.length) return (
    <div style={{ textAlign: "center", padding: 48, color: "var(--muted)", fontFamily: "'Roboto Mono', monospace", fontSize: 13 }}>
      No schedulable courses found. Make sure your file has Room and Timeslot columns.
    </div>
  );

  // ── Tooltip content
  const c = hoveredCourse;
  const pct = c && c.capacity > 0 ? Math.round((c.enrolled / c.capacity) * 100) : null;

  return (
    <div
      style={{ marginTop: 8 }}
      onMouseMove={e => setMouse({ x: e.clientX, y: e.clientY })}
    >

      {/* ── LEGEND ── */}
      <div style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 4 }}>
          SUBJECT KEY
        </span>
        {presentSubjects.map(sub => {
          const color = getColor(sub);
          const info  = SUBJECT_COLORS[sub];
          return (
            <span key={sub} style={{
              background: color.bg, color: color.text,
              padding: "3px 10px", borderRadius: 4,
              fontSize: 11, fontWeight: 700,
              fontFamily: "'Roboto Mono', monospace", letterSpacing: "0.04em",
            }}>
              {info ? `${sub} · ${info.label}` : sub}
            </span>
          );
        })}
      </div>

      {/* ── DAY TABS ── */}
      <div style={{ display: "flex", gap: 6, background: "var(--surface2)", borderRadius: 12, padding: 6, marginBottom: 20, border: "1px solid var(--border)", flexWrap: "wrap" }}>
        {visibleTabs.map(tab => {
          const active = tab.key === currentDay;
          return (
            <button key={tab.key} onClick={() => setActiveDay(tab.key)} style={{
              flex: 1, minWidth: 110, padding: "10px 14px",
              border: active ? "1px solid var(--border)" : "none",
              borderRadius: 8, cursor: "pointer",
              fontFamily: "'Roboto', sans-serif", fontSize: 13, fontWeight: 700,
              background: active ? "#fff" : "transparent",
              color: active ? "var(--text)" : "var(--muted)",
              boxShadow: active ? "0 4px 12px rgba(0,0,0,0.08)" : "none",
              transition: "all 0.2s", whiteSpace: "nowrap",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
              {tab.label}
              <span style={{ background: "rgba(183,146,87,0.12)", color: "var(--gold)", padding: "2px 7px", borderRadius: 4, fontSize: 11, fontWeight: 700, fontFamily: "'Roboto Mono', monospace" }}>
                {tabCounts[tab.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── GRID TABLE ── */}
      {timeSlots.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--muted)", fontSize: 13 }}>No courses for this day pattern.</div>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid var(--border)", boxShadow: "0 10px 40px rgba(0,0,0,0.05)" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: rooms.length * 155 + 110 }}>

            {/* HEADER */}
            <thead>
              <tr>
                <th style={TH_STICKY}>Time</th>
                {rooms.map(room => (
                  <th key={room} style={TH} title={room}>
                    <div style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: "0 auto" }}>
                      {room}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* BODY */}
            <tbody>
              {timeSlots.map((ts, ri) => (
                <tr key={ts.key}>
                  {/* Time label */}
                  <td style={{ ...TD_TIME, background: ri % 2 === 0 ? "var(--surface2)" : "var(--surface)" }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: "var(--text)" }}>{formatTime(ts.start)}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{formatTime(ts.end)}</div>
                  </td>

                  {/* Room cells */}
                  {rooms.map(room => {
                    const courses     = grid[ts.key]?.[room] || [];
                    const hasConflict = courses.length > 1;
                    return (
                      <td key={room} style={{ ...TD_CELL, background: ri % 2 === 0 ? "#fff" : "var(--surface)" }}>
                        {courses.map((course, ci) => {
                          const color     = getColor(course.subject);
                          const isHovered = hoveredCourse?.idx === course.idx;
                          const rawPct    = course.capacity > 0 ? Math.round((course.enrolled / course.capacity) * 100) : null;
                          const fillPct   = rawPct !== null ? Math.min(rawPct, 100) : null;
                          const isOver    = rawPct !== null && rawPct > 100;

                          return (
                            <div
                              key={ci}
                              onClick={() => setEditCourse({ ...course, hasConflict })}
                              onMouseEnter={() => setHoveredCourse(course)}
                              onMouseLeave={() => setHoveredCourse(null)}
                              style={{
                                background: color.bg, color: color.text,
                                borderRadius: 6, padding: "6px 8px",
                                marginBottom: ci < courses.length - 1 ? 3 : 0,
                                cursor: "pointer", userSelect: "none",
                                border: hasConflict
                                  ? "2px solid #ff5252"
                                  : "1px solid rgba(255,255,255,0.15)",
                                boxShadow: isHovered
                                  ? "0 6px 20px rgba(0,0,0,0.3)"
                                  : "0 1px 3px rgba(0,0,0,0.2)",
                                transform: isHovered ? "translateY(-1px) scale(1.01)" : "none",
                                transition: "all 0.15s",
                              }}
                            >
                              {/* Course label */}
                              <div style={{ fontWeight: 700, fontSize: 11, fontFamily: "'Roboto Mono', monospace", letterSpacing: "0.04em" }}>
                                {course.subject} {course.courseNo}
                                {isOver && <span style={{ marginLeft: 4, fontSize: 9, fontWeight: 900, color: "#ff6d00", background: "rgba(255,255,255,0.15)", borderRadius: 3, padding: "1px 3px" }}>OVER</span>}
                              </div>
                              {/* Instructor */}
                              <div style={{ fontSize: 10, opacity: 0.85, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>
                                {course.instructor || "TBD"}
                              </div>
                              {/* Enrollment fill bar */}
                              {fillPct !== null && (
                                <div style={{ marginTop: 5, height: 3, background: "rgba(255,255,255,0.2)", borderRadius: 99, overflow: "hidden" }}>
                                  <div style={{
                                    height: "100%",
                                    width: `${fillPct}%`,
                                    borderRadius: 99,
                                    background: isOver
                                      ? "repeating-linear-gradient(90deg,#ff6d00 0px,#ff6d00 4px,#ffab40 4px,#ffab40 8px)"
                                      : fillPct >= 100 ? "#ff5252"
                                      : fillPct >= 85  ? "#ffd740"
                                      : "rgba(255,255,255,0.75)",
                                  }} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── LEGEND FOOTER ── */}
      <div style={{
        marginTop: 14,
        display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center",
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 10, padding: "10px 16px",
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginRight: 4 }}>Key</span>

        {/* Double-booked */}
        <div style={LEGEND_ITEM}>
          <div style={{ width: 14, height: 14, borderRadius: 3, border: "2px solid #ff5252", background: "rgba(255,82,82,0.15)", flexShrink: 0 }} />
          <span style={LEGEND_TEXT}>Red border = room double-booked</span>
        </div>

        <div style={LEGEND_DIVIDER} />

        {/* Fill bar states */}
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Enrollment bar</span>

        <div style={LEGEND_ITEM}>
          <div style={{ ...BAR_TRACK }}>
            <div style={{ ...BAR_FILL, width: "60%", background: "rgba(0,78,56,0.4)" }} />
          </div>
          <span style={LEGEND_TEXT}>&lt; 85%</span>
        </div>

        <div style={LEGEND_ITEM}>
          <div style={{ ...BAR_TRACK }}>
            <div style={{ ...BAR_FILL, width: "90%", background: "#ffd740" }} />
          </div>
          <span style={LEGEND_TEXT}>≥ 85%</span>
        </div>

        <div style={LEGEND_ITEM}>
          <div style={{ ...BAR_TRACK }}>
            <div style={{ ...BAR_FILL, width: "100%", background: "#ff5252" }} />
          </div>
          <span style={LEGEND_TEXT}>100%</span>
        </div>

        <div style={LEGEND_ITEM}>
          <div style={{ ...BAR_TRACK }}>
            <div style={{ ...BAR_FILL, width: "100%", background: "repeating-linear-gradient(90deg,#ff6d00 0px,#ff6d00 4px,#ffab40 4px,#ffab40 8px)" }} />
          </div>
          <span style={{ ...LEGEND_TEXT, fontWeight: 700, color: "#ff6d00" }}>Over capacity</span>
        </div>

        <div style={LEGEND_DIVIDER} />

        <span style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>Hover any card for full details</span>
      </div>

      {/* ── FLOATING TOOLTIP ── */}
      {hoveredCourse && (
        <div style={{
          position: "fixed",
          left: Math.min(mouse.x + 14, window.innerWidth - 260),
          top: Math.max(mouse.y - 10, 8),
          zIndex: 9999,
          pointerEvents: "none",
          background: "#fff",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "12px 16px",
          minWidth: 230,
          maxWidth: 270,
          boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
          fontFamily: "'Roboto', sans-serif",
        }}>
          {/* Color accent bar */}
          <div style={{ height: 3, background: getColor(hoveredCourse.subject).bg, borderRadius: 99, marginBottom: 10 }} />

          <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 14, marginBottom: 4 }}>
            {hoveredCourse.subject} {hoveredCourse.courseNo}
            {hoveredCourse.section && <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 12 }}> · Sec {hoveredCourse.section}</span>}
          </div>

          {hoveredCourse.title && (
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, lineHeight: 1.4 }}>
              {hoveredCourse.title}
            </div>
          )}

          {[
            ["👤", "Instructor", hoveredCourse.instructor || "TBD"],
            ["👥", "Enrollment", `${hoveredCourse.enrolled} / ${hoveredCourse.capacity || "?"} ${pct !== null ? `(${pct}%)` : ""}`],
            ["🏫", "Room",       hoveredCourse.room],
            ["📅", "Days",       hoveredCourse.days],
            ["📋", "CRN",        hoveredCourse.crn],
          ].map(([icon, label, val]) => (
            <div key={label} style={{ display: "flex", gap: 8, marginBottom: 5, fontSize: 12, alignItems: "flex-start" }}>
              <span>{icon}</span>
              <span style={{ color: "var(--muted)", minWidth: 72 }}>{label}</span>
              <span style={{ color: "#333", fontWeight: 600 }}>{val}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── EDIT POPOVER ── */}
      {editCourse && (
        <EditPopover
          course={editCourse}
          hasConflict={editCourse.hasConflict}
          allCourses={parsed}
          rawRows={schedule}
          onSave={(updates) => {
            onUpdateRow(editCourse.idx, updates);
            setEditCourse(null);
          }}
          onAddSection={(newRow, origUpdates) => {
            if (origUpdates) onUpdateRow(editCourse.idx, origUpdates);
            onAddRow(newRow);
            setEditCourse(null);
          }}
          onClose={() => setEditCourse(null)}
        />
      )}
    </div>
  );
}

// ─── STYLE CONSTANTS ─────────────────────────────────────────────────────────
const TH_BASE = {
  padding: "12px 8px",
  textAlign: "center",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "var(--text)",
  background: "var(--surface2)",
  borderBottom: "2px solid var(--border)",
  whiteSpace: "nowrap",
  minWidth: 155,
};

const TH = TH_BASE;

const TH_STICKY = {
  ...TH_BASE,
  position: "sticky",
  left: 0,
  zIndex: 3,
  minWidth: 100,
  width: 100,
  borderRight: "2px solid var(--border)",
};

const TD_TIME = {
  padding: "10px 12px",
  textAlign: "center",
  borderBottom: "1px solid var(--border)",
  position: "sticky",
  left: 0,
  zIndex: 1,
  borderRight: "2px solid var(--border)",
  minWidth: 100,
  width: 100,
};

const TD_CELL = {
  padding: "6px",
  verticalAlign: "top",
  borderBottom: "1px solid var(--border)",
  minWidth: 155,
};

const LEGEND_ITEM = {
  display: "flex", alignItems: "center", gap: 6,
};

const LEGEND_TEXT = {
  fontSize: 11, color: "var(--muted)",
  fontFamily: "'Roboto', sans-serif", whiteSpace: "nowrap",
};

const LEGEND_DIVIDER = {
  width: 1, height: 20, background: "var(--border)", flexShrink: 0,
};

const BAR_TRACK = {
  width: 36, height: 6, borderRadius: 99,
  background: "rgba(0,0,0,0.1)", overflow: "hidden", flexShrink: 0,
};

const BAR_FILL = {
  height: "100%", borderRadius: 99,
};
