import { useState, useMemo, useEffect, useRef } from "react";
import { parseTime } from "./auditLogic";
import { canon, buildExamMap, EXAM_SCHEDULES } from "./examLogic";
import {
  GEMINI_PROMPT,
  jsonToSchedule,
  saveCustomSchedule,
  loadCustomSchedules,
  deleteCustomSchedule,
} from "./examImporter";

// Reuse same color map as ScheduleGrid
const SUBJECT_COLORS = {
  MKTG: { bg: "#8B0000", text: "#fff" },
  BNAL: { bg: "#1565C0", text: "#fff" },
  ACCT: { bg: "#006064", text: "#fff" },
  FINA: { bg: "#1B5E20", text: "#fff" },
  MGMT: { bg: "#4A148C", text: "#fff" },
  BUAD: { bg: "#004E38", text: "#fff" },
  IBUS: { bg: "#BF360C", text: "#fff" },
  ENTR: { bg: "#B79257", text: "#fff" },
  OPER: { bg: "#1A237E", text: "#fff" },
  SCM:  { bg: "#004D40", text: "#fff" },
  MBA:  { bg: "#37474F", text: "#fff" },
};
const DEFAULT_COLOR = { bg: "#546E7A", text: "#fff" };

function getColor(subject) {
  return SUBJECT_COLORS[String(subject || "").trim().toUpperCase()] || DEFAULT_COLOR;
}

function formatTime(min) {
  if (min === null) return "—";
  const h = Math.floor(min / 60), m = min % 60;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

// ── Course card ───────────────────────────────────────────────────────────────
function CourseCard({ course, onEnter, onLeave }) {
  const color = getColor(course.subject);
  const pct   = course.capacity > 0 ? Math.min(Math.round((course.enrolled / course.capacity) * 100), 100) : null;
  return (
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        background: color.bg, color: color.text,
        borderRadius: 6, padding: "5px 8px", marginBottom: 3,
        fontSize: 11, fontFamily: "'Roboto Mono', monospace",
        border: course._slot?.isOverride ? "2px dashed rgba(255,255,255,0.5)" : "1px solid rgba(255,255,255,0.12)",
        cursor: "default", userSelect: "none",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        transition: "transform 0.1s",
      }}
    >
      <div style={{ fontWeight: 700, letterSpacing: "0.04em" }}>{course.subject} {course.courseNo}</div>
      <div style={{ fontSize: 10, opacity: 0.85, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }}>
        {course.instructor || "TBD"}
      </div>
      {pct !== null && (
        <div style={{ marginTop: 4, height: 2, background: "rgba(255,255,255,0.2)", borderRadius: 99 }}>
          <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: pct >= 100 ? "#ff5252" : pct >= 85 ? "#ffd740" : "rgba(255,255,255,0.7)" }} />
        </div>
      )}
      {course._slot?.isOverride && (
        <div style={{ fontSize: 9, opacity: 0.75, marginTop: 2, fontStyle: "italic" }}>★ override</div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ExamSchedule({ schedule }) {
  const [semester, setSemester]         = useState("Fall 2026");
  const [hoveredCourse, setHoveredCourse] = useState(null);
  const [mouse, setMouse]               = useState({ x: 0, y: 0 });

  // Import panel state
  const [showImport, setShowImport]       = useState(false);
  const [importJson, setImportJson]       = useState("");
  const [importError, setImportError]     = useState(null);
  const [importSuccess, setImportSuccess] = useState(null);
  const [copied, setCopied]               = useState(false);
  const textareaRef                       = useRef(null);

  // Custom schedules loaded from localStorage
  const [customSchedules, setCustomSchedules] = useState({});
  useEffect(() => {
    const loaded = loadCustomSchedules();
    const map = {};
    loaded.forEach(s => { map[s.semester] = s; });
    setCustomSchedules(map);
  }, []);

  // Merge built-in + custom schedules
  const allSchedules = useMemo(
    () => ({ ...EXAM_SCHEDULES, ...customSchedules }),
    [customSchedules]
  );

  const examSchedule = allSchedules[semester] ?? Object.values(allSchedules)[0];

  function handleCopyPrompt() {
    navigator.clipboard.writeText(GEMINI_PROMPT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  function handleImport() {
    setImportError(null);
    setImportSuccess(null);
    let parsed;
    try {
      parsed = JSON.parse(importJson.trim());
    } catch {
      setImportError("Invalid JSON — make sure you copied the full response from Gemini.");
      return;
    }
    let converted;
    try {
      converted = jsonToSchedule(parsed);
    } catch (e) {
      setImportError(`Could not read schedule: ${e.message}`);
      return;
    }
    saveCustomSchedule(converted);
    setCustomSchedules(prev => ({ ...prev, [converted.semester]: converted }));
    setSemester(converted.semester);
    setImportJson("");
    setImportSuccess(`"${converted.semester}" loaded — ${converted.examDays.length} exam days, ${converted.rules.length} rules.`);
    setTimeout(() => { setShowImport(false); setImportSuccess(null); }, 3000);
  }

  function handleDelete(sem) {
    if (!window.confirm(`Delete "${sem}" exam schedule?`)) return;
    deleteCustomSchedule(sem);
    setCustomSchedules(prev => {
      const next = { ...prev };
      delete next[sem];
      return next;
    });
    if (semester === sem) setSemester("Fall 2026");
  }

  // Parse raw schedule rows into course objects
  const parsed = useMemo(() => schedule.map((row, idx) => {
    const [start] = parseTime(row["Timeslot 1"] || row["Time"] || "");
    return {
      idx,
      start,
      days:       String(row["Days 1"]      ?? row["Days"]        ?? "").trim(),
      subject:    String(row["Subject"]     || "").trim().toUpperCase(),
      courseNo:   String(row["Course No"]   || "").trim(),
      section:    String(row["Section"]     || "").trim(),
      title:      String(row["Title"] || row["Course Title"] || "").trim(),
      instructor: String(row["Instr Last"]  ?? row["Instructor"]  ?? "").trim(),
      enrolled:   Number(row["Adj. Enrl"]   ?? row["Enrolled"]    ?? 0),
      capacity:   Number(row["Room Cap"]    ?? row["Capacity"]    ?? 0),
      crn:        String(row["CRN"]         || "").trim(),
      room:       String(row["Room"]        || "").trim(),
    };
  }), [schedule]);

  const { map, unmatched } = useMemo(
    () => buildExamMap(parsed, examSchedule),
    [parsed, examSchedule]
  );

  const totalAssigned = useMemo(
    () => Object.values(map).reduce((a, v) => a + v.length, 0),
    [map]
  );

  const c = hoveredCourse;
  const pct = c && c.capacity > 0 ? Math.round((c.enrolled / c.capacity) * 100) : null;

  return (
    <div style={{ marginTop: 8 }} onMouseMove={e => setMouse({ x: e.clientX, y: e.clientY })}>

      {/* ── Weather / special note banner ── */}
      {examSchedule.weatherNote && (
        <div style={{
          background: "rgba(211,47,47,0.06)", border: "1px solid rgba(211,47,47,0.25)",
          borderRadius: 8, padding: "10px 16px", marginBottom: 16,
          fontSize: 12, color: "var(--red)", fontFamily: "'Roboto', sans-serif", lineHeight: 1.5,
        }}>
          {examSchedule.weatherNote}
        </div>
      )}

      {/* ── Controls row ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: showImport ? 12 : 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Semester
          </label>
          <select
            value={semester}
            onChange={e => setSemester(e.target.value)}
            style={{
              background: "#fff", border: "1px solid var(--border)",
              borderRadius: 8, padding: "8px 14px",
              fontFamily: "'Roboto', sans-serif", fontSize: 13, fontWeight: 600,
              color: "var(--text)", cursor: "pointer", outline: "none",
            }}
          >
            {Object.keys(allSchedules).map(s => (
              <option key={s}>{s}{customSchedules[s] ? " ★" : ""}</option>
            ))}
          </select>
          {/* Delete button for custom schedules */}
          {customSchedules[semester] && (
            <button
              onClick={() => handleDelete(semester)}
              title="Delete this imported schedule"
              style={{
                background: "none", border: "1px solid var(--red)", borderRadius: 6,
                color: "var(--red)", padding: "5px 9px", fontSize: 12, cursor: "pointer",
              }}
            >
              ✕ Delete
            </button>
          )}
        </div>

        {/* Quick stats */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { label: "Assigned",   val: totalAssigned,    color: "var(--green)" },
            { label: "Unmatched",  val: unmatched.length, color: unmatched.length > 0 ? "var(--red)" : "var(--muted)" },
            { label: "Exam days",  val: examSchedule.examDays.length, color: "var(--gold)" },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 14px", textAlign: "center" }}>
              <div style={{ fontFamily: "'Aleo', serif", fontSize: "1.4rem", fontWeight: 700, color, lineHeight: 1 }}>{val}</div>
              <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Import button */}
        <button
          onClick={() => { setShowImport(v => !v); setImportError(null); setImportSuccess(null); }}
          style={{
            marginLeft: "auto", background: showImport ? "var(--surface2)" : "#fff",
            border: "1px solid var(--border)", borderRadius: 8,
            padding: "8px 14px", fontSize: 12, fontWeight: 700,
            color: "var(--text)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          }}
        >
          ＋ Import Semester
        </button>
      </div>

      {/* ── Import panel ── */}
      {showImport && (
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 12, padding: "20px 24px", marginBottom: 20,
          boxShadow: "0 4px 20px rgba(0,0,0,0.07)",
        }}>
          <h4 style={{ fontFamily: "'Aleo', serif", fontSize: "1.05rem", fontWeight: 700, marginBottom: 6, color: "var(--text)" }}>
            Import a New Exam Schedule
          </h4>

          {/* Step 1 */}
          <div style={{ marginBottom: 18 }}>
            <div style={STEP_LABEL}>Step 1 — Copy the prompt</div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, lineHeight: 1.6 }}>
              Click the button below, then go to{" "}
              <strong style={{ color: "var(--text)" }}>gemini.google.com</strong>,
              start a new chat, paste the prompt, and attach or paste the exam schedule text.
              Gemini will reply with JSON.
            </p>
            <button onClick={handleCopyPrompt} style={{
              background: copied ? "#2e7d32" : "var(--gold)",
              color: "#fff", border: "none", borderRadius: 8,
              padding: "9px 18px", fontWeight: 700, fontSize: 13,
              cursor: "pointer", transition: "background 0.2s",
            }}>
              {copied ? "✓ Prompt Copied!" : "📋 Copy Prompt"}
            </button>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "var(--border)", marginBottom: 18 }} />

          {/* Step 2 */}
          <div>
            <div style={STEP_LABEL}>Step 2 — Paste Gemini's response</div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, lineHeight: 1.6 }}>
              Copy the JSON that Gemini gives you and paste it below.
            </p>
            <textarea
              ref={textareaRef}
              value={importJson}
              onChange={e => { setImportJson(e.target.value); setImportError(null); }}
              placeholder={'{\n  "semester": "Spring 2027",\n  "slots": [...]\n}'}
              rows={9}
              style={{
                width: "100%", boxSizing: "border-box",
                fontFamily: "'Roboto Mono', monospace", fontSize: 12,
                border: importError ? "1.5px solid var(--red)" : "1px solid var(--border)",
                borderRadius: 8, padding: "10px 12px",
                resize: "vertical", outline: "none",
                background: "#fff", color: "var(--text)", lineHeight: 1.5,
              }}
            />
            {importError && (
              <div style={{ fontSize: 12, color: "var(--red)", marginTop: 6, lineHeight: 1.5 }}>
                ⚠ {importError}
              </div>
            )}
            {importSuccess && (
              <div style={{ fontSize: 12, color: "#2e7d32", marginTop: 6, fontWeight: 600 }}>
                ✓ {importSuccess}
              </div>
            )}
            <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
              <button
                onClick={handleImport}
                disabled={!importJson.trim()}
                style={{
                  background: importJson.trim() ? "#004E38" : "var(--surface2)",
                  color: importJson.trim() ? "#fff" : "var(--muted)",
                  border: "none", borderRadius: 8,
                  padding: "9px 20px", fontWeight: 700, fontSize: 13,
                  cursor: importJson.trim() ? "pointer" : "not-allowed",
                }}
              >
                Load Schedule
              </button>
              <button
                onClick={() => { setShowImport(false); setImportJson(""); setImportError(null); }}
                style={{
                  background: "none", border: "1px solid var(--border)", borderRadius: 8,
                  padding: "9px 16px", fontSize: 13, color: "var(--muted)", cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Exam Grid ── */}
      <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid var(--border)", boxShadow: "0 10px 40px rgba(0,0,0,0.05)" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 780 }}>
          <thead>
            <tr>
              <th style={TH_DATE}>Exam Date</th>
              {[1, 2, 3].map(p => (
                <th key={p} style={TH_PERIOD}>
                  <div style={{ fontWeight: 700 }}>{examSchedule.periods[p].label}</div>
                  <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.7, marginTop: 2 }}>
                    {examSchedule.periods[p].time}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {examSchedule.examDays.map((examDay, ri) => {
              const rowBg = ri % 2 === 0 ? "#fff" : "var(--surface)";
              return (
                <tr key={examDay.id}>
                  {/* Date label */}
                  <td style={{ ...TD_DATE, background: ri % 2 === 0 ? "var(--surface2)" : "var(--surface)" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{examDay.date}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{examDay.day}</div>
                  </td>

                  {/* Period cells */}
                  {[1, 2, 3].map(period => {
                    const slotId   = `${examDay.id}_${period}`;
                    const courses  = map[slotId] || [];

                    // Find the rule note for this slot
                    const rule = examSchedule.rules.find(
                      r => r.day === examDay.id && r.period === period && r.match.type !== "courses"
                    );

                    return (
                      <td key={period} style={{ ...TD_CELL, background: rowBg }}>
                        {/* Rule description */}
                        {rule && (
                          <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'Roboto Mono', monospace", marginBottom: courses.length ? 6 : 0, letterSpacing: "0.02em" }}>
                            {rule.note}
                          </div>
                        )}
                        {/* Course cards */}
                        {courses.map((course, ci) => (
                          <CourseCard
                            key={ci}
                            course={course}
                            onEnter={() => setHoveredCourse(course)}
                            onLeave={() => setHoveredCourse(null)}
                          />
                        ))}
                        {/* Empty cell hint */}
                        {courses.length === 0 && !rule && (
                          <div style={{ fontSize: 10, color: "var(--border)", fontStyle: "italic" }}>—</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Legend ── */}
      <div style={{ marginTop: 10, display: "flex", gap: 20, flexWrap: "wrap", fontSize: 11, color: "var(--muted)", fontFamily: "'Roboto Mono', monospace" }}>
        <span>★ dashed border = named course override</span>
        <span>▬ fill bar = enrollment % (yellow ≥ 85%, red = over capacity)</span>
        <span>Hover a card for full details</span>
      </div>

      {/* ── Unmatched courses ── */}
      {unmatched.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
            <h3 style={{ fontFamily: "'Aleo', serif", fontSize: "1.2rem", fontWeight: 700, color: "var(--red)" }}>
              ⚠ Unmatched Courses ({unmatched.length})
            </h3>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>
          <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
            These courses have a valid meeting time but didn't match any rule in the <strong>{semester}</strong> exam schedule.
            They may use an unusual meeting time or day pattern that needs to be manually assigned.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {unmatched.map((course, i) => {
              const color = getColor(course.subject);
              return (
                <div
                  key={i}
                  onMouseEnter={() => setHoveredCourse(course)}
                  onMouseLeave={() => setHoveredCourse(null)}
                  style={{
                    background: color.bg, color: color.text,
                    borderRadius: 8, padding: "8px 12px",
                    fontFamily: "'Roboto Mono', monospace", fontSize: 11,
                    border: "2px solid #d32f2f",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                    cursor: "default",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{course.subject} {course.courseNo}</div>
                  <div style={{ fontSize: 10, opacity: 0.85, marginTop: 1 }}>
                    {canon(course.days) || "?"} · {formatTime(course.start)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Floating tooltip ── */}
      {hoveredCourse && (
        <div style={{
          position: "fixed",
          left: Math.min(mouse.x + 14, window.innerWidth - 265),
          top:  Math.max(mouse.y - 10, 8),
          zIndex: 9999, pointerEvents: "none",
          background: "#fff", border: "1px solid var(--border)",
          borderRadius: 10, padding: "12px 16px",
          minWidth: 230, maxWidth: 270,
          boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
          fontFamily: "'Roboto', sans-serif",
        }}>
          <div style={{ height: 3, background: getColor(hoveredCourse.subject).bg, borderRadius: 99, marginBottom: 10 }} />
          <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 14, marginBottom: 4 }}>
            {hoveredCourse.subject} {hoveredCourse.courseNo}
            {hoveredCourse.section && <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 12 }}> · Sec {hoveredCourse.section}</span>}
          </div>
          {hoveredCourse.title && (
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, lineHeight: 1.4 }}>{hoveredCourse.title}</div>
          )}
          {hoveredCourse._slot && (
            <div style={{ fontSize: 11, background: "var(--surface)", borderRadius: 6, padding: "4px 8px", marginBottom: 8, color: "var(--gold)", fontFamily: "'Roboto Mono', monospace", fontWeight: 700 }}>
              📅 Exam: {examSchedule.examDays.find(d => d.id === hoveredCourse._slot.dayId)?.date} · {examSchedule.periods[hoveredCourse._slot.period].time}
            </div>
          )}
          {[
            ["👤", "Instructor", hoveredCourse.instructor || "TBD"],
            ["👥", "Enrollment", `${hoveredCourse.enrolled} / ${hoveredCourse.capacity || "?"} ${pct !== null ? `(${pct}%)` : ""}`],
            ["🏫", "Room",       hoveredCourse.room || "TBA"],
            ["📅", "Meets",      `${canon(hoveredCourse.days) || "?"} · ${formatTime(hoveredCourse.start)}`],
            ["📋", "CRN",        hoveredCourse.crn || "—"],
          ].map(([icon, label, val]) => (
            <div key={label} style={{ display: "flex", gap: 8, marginBottom: 5, fontSize: 12, alignItems: "flex-start" }}>
              <span>{icon}</span>
              <span style={{ color: "var(--muted)", minWidth: 72 }}>{label}</span>
              <span style={{ color: "#333", fontWeight: 600 }}>{val}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── STYLE CONSTANTS ──────────────────────────────────────────────────────────
const TH_DATE = {
  padding: "14px 16px", textAlign: "left",
  fontSize: 11, fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.1em",
  color: "var(--text)", background: "var(--surface2)",
  borderBottom: "2px solid var(--border)",
  position: "sticky", left: 0, zIndex: 3,
  minWidth: 140, borderRight: "2px solid var(--border)",
};

const TH_PERIOD = {
  padding: "14px 16px", textAlign: "left",
  fontSize: 11, fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.08em",
  color: "var(--text)", background: "var(--surface2)",
  borderBottom: "2px solid var(--border)",
  minWidth: 210,
};

const TD_DATE = {
  padding: "12px 16px", verticalAlign: "top",
  borderBottom: "1px solid var(--border)",
  position: "sticky", left: 0, zIndex: 1,
  borderRight: "2px solid var(--border)",
  minWidth: 140,
};

const TD_CELL = {
  padding: "10px 12px", verticalAlign: "top",
  borderBottom: "1px solid var(--border)",
  minWidth: 210,
};

const STEP_LABEL = {
  fontSize: 11, fontWeight: 700, color: "var(--muted)",
  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8,
};
