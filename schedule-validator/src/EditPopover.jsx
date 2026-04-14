import { useState, useEffect } from "react";
import { getGeminiSuggestions, buildSuggestPrompt, saveSuggestApiKey, loadSuggestApiKey } from "./geminiSuggest";

// ── Time utilities ────────────────────────────────────────────────────────────
function minToTimeInput(min) {
  if (min == null) return '';
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function timeInputToMin(val) {
  if (!val) return null;
  const [h, m] = val.split(':').map(Number);
  return h * 60 + m;
}
function fmt(min) {
  if (min == null) return '?';
  const h = Math.floor(min / 60), m = min % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}
// Produces "HHMM-HHMM DAYS" format matching original schedule files (e.g. "0800-0920 TR")
function fmtTimeslot(startMin, endMin, days) {
  const pad = (min) => {
    const h = Math.floor(min / 60), m = min % 60;
    return `${String(h).padStart(2,'0')}${String(m).padStart(2,'0')}`;
  };
  return `${pad(startMin)}-${pad(endMin)}${days ? ' ' + days : ''}`;
}

// ── Day options ───────────────────────────────────────────────────────────────
const DAY_OPTIONS = ['MW', 'TR', 'MWF', 'M', 'T', 'W', 'R', 'F', 'MTWRF'];

// ── Suggestion card colors ────────────────────────────────────────────────────
const SUGGEST_COLORS = {
  change_room:  { bg: '#e8f5e9', border: '#2e7d32', icon: '🏫', label: 'Move Room'    },
  add_section:  { bg: '#e3f2fd', border: '#1565C0', icon: '➕', label: 'Add Section'  },
};

// Columns added internally by the parser — never export these
const INTERNAL_COLS = new Set([
  'idx','start','end','days','dayTab','room','subject',
  'courseNo','section','title','instructor','enrolled','capacity','crn',
]);

export default function EditPopover({ course, hasConflict, allCourses, rawRows, onSave, onAddSection, onClose }) {
  // ── Form state (editing existing course) ──
  const [room,     setRoom]     = useState(course.room     || '');
  const [days,     setDays]     = useState(course.days     || 'MW');
  const [startMin, setStartMin] = useState(course.start);
  const [endMin,   setEndMin]   = useState(course.end);
  const [capacity, setCapacity] = useState(course.capacity || '');
  const [enrolled, setEnrolled] = useState(course.enrolled || '');

  // ── Add section sub-form ──
  const splitEnrolled = Math.floor(course.enrolled / 2);
  const [showAddSection, setShowAddSection] = useState(false);
  const [secRoom,      setSecRoom]     = useState('');
  const [secDays,      setSecDays]     = useState('TR');
  const [secStartMin,  setSecStartMin] = useState(null);
  const [secEndMin,    setSecEndMin]   = useState(null);
  const [secCapacity,  setSecCapacity] = useState('');
  const [secEnrolled,  setSecEnrolled] = useState(String(splitEnrolled));

  // ── Suggest fix ──
  const [showSuggest,  setShowSuggest]  = useState(false);
  const [suggestMode,  setSuggestMode]  = useState('browser'); // 'browser' | 'api'
  const [promptCopied, setPromptCopied] = useState(false);
  const [apiKey,       setApiKey]       = useState(() => loadSuggestApiKey());
  const [apiKeyDraft,  setApiKeyDraft]  = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [suggestError, setSuggestError] = useState(null);
  const [suggestions,  setSuggestions]  = useState([]);

  const rawPct    = course.capacity > 0 ? Math.round((course.enrolled / course.capacity) * 100) : null;
  const isOver    = rawPct !== null && rawPct > 100;
  const isFlagged = isOver || hasConflict;

  // ── Room → known capacity map ──
  const roomCapMap = {};
  allCourses.forEach(c => {
    if (c.room && c.capacity > 0)
      roomCapMap[c.room] = Math.max(roomCapMap[c.room] || 0, c.capacity);
  });

  // ── Rooms datalist ──
  const allRooms = [...new Set(allCourses.map(c => c.room).filter(r => r && r !== 'TBA' && r !== '-'))].sort();

  // ── Auto-fill capacity when room changes ──
  useEffect(() => {
    if (roomCapMap[room]) setCapacity(String(roomCapMap[room]));
  }, [room]);

  useEffect(() => {
    if (roomCapMap[secRoom]) setSecCapacity(String(roomCapMap[secRoom]));
  }, [secRoom]);

  // ── Auto-increment section number ──
  function nextSection() {
    const existing = allCourses
      .filter(c => c.subject === course.subject && c.courseNo === course.courseNo)
      .map(c => parseInt(c.section) || 0);
    const max = existing.length ? Math.max(...existing) : 0;
    return String(max + 1).padStart(2, '0');
  }

  function handleSave() {
    const updates = {
      Room: room,
      'Days 1': days,
      'Timeslot 1': fmtTimeslot(startMin, endMin, days),
      'Room Cap': Number(capacity) || course.capacity,
      'Adj. Enrl': Number(enrolled) || course.enrolled,
      Enrolled: Number(enrolled) || course.enrolled,
    };
    onSave(updates);
  }

  function handleAddSection() {
    if (!secRoom || secStartMin == null || secEndMin == null) return;
    const newSecEnrolled = Number(secEnrolled) || splitEnrolled;
    const origEnrolled   = course.enrolled - newSecEnrolled;

    // Use the original raw row as template so no internal parsed fields leak in
    const rawTemplate = rawRows?.[course.idx] ?? {};
    const cleanTemplate = Object.fromEntries(
      Object.entries(rawTemplate).filter(([k]) => !INTERNAL_COLS.has(k))
    );

    const newRow = {
      ...cleanTemplate,
      Room: secRoom,
      'Days 1': secDays,
      'Timeslot 1': fmtTimeslot(secStartMin, secEndMin, secDays),
      'Room Cap': Number(secCapacity) || 0,
      'Adj. Enrl': newSecEnrolled,
      'Section No': nextSection(),
      CRN: '',
    };

    // Also update the original section's enrolled count
    const origUpdates = {
      'Adj. Enrl': origEnrolled,
      Enrolled: origEnrolled,
    };

    onAddSection(newRow, origUpdates);
  }

  async function handleGetSuggestions() {
    setSuggestError(null);
    setSuggestions([]);
    setLoading(true);
    try {
      const results = await getGeminiSuggestions(apiKey, course, allCourses, isOver ? 'over' : 'conflict');
      setSuggestions(results);
    } catch (e) {
      setSuggestError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function applySuggestion(s) {
    if (s.type === 'change_room') {
      setRoom(s.room || room);
      if (s.capacity) setCapacity(String(s.capacity));
      setSuggestions([]);
      setShowSuggest(false);
    } else if (s.type === 'add_section') {
      // Pre-fill the add section form
      setShowSuggest(false);
      setShowAddSection(true);
      setSecRoom(s.room || '');
      setSecDays(s.days || 'TR');
      if (s.startTime) {
        const parsed = parseTimeStr(s.startTime);
        if (parsed != null) setSecStartMin(parsed);
      }
      if (s.endTime) {
        const parsed = parseTimeStr(s.endTime);
        if (parsed != null) setSecEndMin(parsed);
      }
      if (s.capacity) setSecCapacity(String(s.capacity));
    }
  }

  function parseTimeStr(str) {
    const m = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!m) return null;
    let h = parseInt(m[1]);
    const min = parseInt(m[2]);
    const period = m[3].toUpperCase();
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return h * 60 + min;
  }

  // ── Keyboard close ──
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9990,
          background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)',
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', zIndex: 9991,
        top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        background: '#fff', borderRadius: 14,
        boxShadow: '0 24px 80px rgba(0,0,0,0.22)',
        width: 480, maxWidth: '95vw', maxHeight: '90vh',
        overflow: 'auto',
        fontFamily: "'Roboto', sans-serif",
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #d8dcdb',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#004E38', borderRadius: '14px 14px 0 0',
        }}>
          <div>
            <div style={{ fontFamily: "'Roboto Mono', monospace", fontWeight: 700, color: '#fff', fontSize: 15, letterSpacing: '0.04em' }}>
              {course.subject} {course.courseNo}
              {course.section && <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: 8, fontSize: 12 }}>Sec {course.section}</span>}
              {isOver      && <span style={{ marginLeft: 10, fontSize: 10, background: '#ff6d00', color: '#fff', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>OVER CAPACITY</span>}
              {hasConflict && !isOver && <span style={{ marginLeft: 10, fontSize: 10, background: '#d32f2f', color: '#fff', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>DOUBLE BOOKED</span>}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 3 }}>
              {course.title || ''}{course.instructor ? ` · ${course.instructor}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
            borderRadius: 8, width: 30, height: 30, fontSize: 16, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px' }}>

          {/* ── Edit fields ── */}
          <div style={{ fontSize: 11, fontWeight: 700, color: '#5f6d66', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
            Edit Course Details
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            {/* Room */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={LABEL}>Room</label>
              <input
                list="room-options"
                value={room}
                onChange={e => setRoom(e.target.value)}
                style={INPUT}
                placeholder="e.g. Miller 100"
              />
              <datalist id="room-options">
                {allRooms.map(r => <option key={r} value={r} />)}
              </datalist>
            </div>

            {/* Days */}
            <div>
              <label style={LABEL}>Days</label>
              <select value={DAY_OPTIONS.includes(days) ? days : 'MW'} onChange={e => setDays(e.target.value)} style={INPUT}>
                {DAY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {/* Capacity */}
            <div>
              <label style={LABEL}>
                Room Capacity{roomCapMap[room] ? <span style={{ color: '#2e7d32', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}> · auto-filled</span> : ''}
              </label>
              <input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} style={INPUT} min={0} />
            </div>

            {/* Start time */}
            <div>
              <label style={LABEL}>Start Time</label>
              <input type="time" value={minToTimeInput(startMin)} onChange={e => setStartMin(timeInputToMin(e.target.value))} style={INPUT} />
            </div>

            {/* End time */}
            <div>
              <label style={LABEL}>End Time</label>
              <input type="time" value={minToTimeInput(endMin)} onChange={e => setEndMin(timeInputToMin(e.target.value))} style={INPUT} />
            </div>

            {/* Enrolled */}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={LABEL}>Enrolled Students</label>
              <input type="number" value={enrolled} onChange={e => setEnrolled(e.target.value)} style={INPUT} min={0} />
            </div>
          </div>

          {/* ── Suggest Fix ── */}
          {isFlagged && (
            <div style={{
              background: '#f8faf9', border: '1px solid #d8dcdb',
              borderRadius: 10, padding: 14, marginBottom: 14,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showSuggest ? 12 : 0 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#004E38' }}>✨ Suggest Fix with Gemini</div>
                  <div style={{ fontSize: 11, color: '#5f6d66', marginTop: 2 }}>
                    {isOver && hasConflict ? `Over capacity & double-booked`
                      : isOver ? `${course.enrolled - course.capacity} students over capacity`
                      : 'Room double-booked — another course is in this room at the same time'}
                  </div>
                </div>
                <button
                  onClick={() => setShowSuggest(v => !v)}
                  style={{
                    background: '#B79257', color: '#fff', border: 'none',
                    borderRadius: 8, padding: '7px 14px', fontWeight: 700,
                    fontSize: 12, cursor: 'pointer',
                  }}
                >
                  {showSuggest ? 'Hide' : 'Get Suggestions'}
                </button>
              </div>

              {showSuggest && (
                <div>
                  {/* Mode toggle */}
                  <div style={{ display: 'flex', background: '#eff3f1', borderRadius: 8, padding: 3, marginBottom: 12, gap: 3 }}>
                    {[
                      { key: 'browser', label: '🌐 Copy Prompt', sub: 'No key needed' },
                      { key: 'api',     label: '⚡ Use API',     sub: 'Requires credits' },
                    ].map(m => (
                      <button key={m.key} onClick={() => { setSuggestMode(m.key); setSuggestError(null); setSuggestions([]); }} style={{
                        flex: 1, border: suggestMode === m.key ? '1px solid #d8dcdb' : 'none',
                        borderRadius: 6, padding: '6px 8px', cursor: 'pointer',
                        background: suggestMode === m.key ? '#fff' : 'transparent',
                        fontFamily: "'Roboto', sans-serif",
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: suggestMode === m.key ? '#004E38' : '#5f6d66' }}>{m.label}</div>
                        <div style={{ fontSize: 10, color: '#5f6d66', marginTop: 1 }}>{m.sub}</div>
                      </button>
                    ))}
                  </div>

                  {/* ── Browser mode ── */}
                  {suggestMode === 'browser' && (
                    <div>
                      <p style={{ fontSize: 12, color: '#5f6d66', marginBottom: 10, lineHeight: 1.6 }}>
                        Copy the prompt below → paste it into <strong style={{ color: '#004E38' }}>gemini.google.com</strong> → use Gemini's response to fill in the fields above manually.
                      </p>
                      <button
                        onClick={() => {
                          const prompt = buildSuggestPrompt(course, allCourses, isOver ? 'over' : 'conflict');

                          navigator.clipboard.writeText(prompt).then(() => {
                            setPromptCopied(true);
                            setTimeout(() => setPromptCopied(false), 2500);
                          });
                        }}
                        style={{
                          width: '100%', border: 'none', borderRadius: 8,
                          padding: '9px 16px', fontWeight: 700, fontSize: 13,
                          cursor: 'pointer', transition: 'background 0.2s',
                          background: promptCopied ? '#2e7d32' : '#B79257',
                          color: '#fff',
                        }}
                      >
                        {promptCopied ? '✓ Prompt Copied!' : '📋 Copy Prompt to Clipboard'}
                      </button>
                      {promptCopied && (
                        <p style={{ fontSize: 11, color: '#2e7d32', marginTop: 8, textAlign: 'center' }}>
                          Now paste it at <strong>gemini.google.com</strong> and use the suggestions to edit the fields above.
                        </p>
                      )}
                    </div>
                  )}

                  {/* ── API mode ── */}
                  {suggestMode === 'api' && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        {apiKey
                          ? <><span style={{ fontSize: 11, color: '#5f6d66' }}>API key saved ✓</span><button onClick={() => setShowKeyInput(v => !v)} style={SMALL_BTN}>Change</button></>
                          : <span style={{ fontSize: 11, color: '#d32f2f', fontWeight: 600 }}>⚠ No API key set</span>
                        }
                        {!apiKey && !showKeyInput && (
                          <button onClick={() => setShowKeyInput(true)} style={{ ...SMALL_BTN, background: '#004E38', color: '#fff' }}>Add key</button>
                        )}
                      </div>

                      {(showKeyInput || !apiKey) && (
                        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                          <input type="password" placeholder="AIza..." value={apiKeyDraft}
                            onChange={e => setApiKeyDraft(e.target.value)}
                            style={{ ...INPUT, flex: 1, marginBottom: 0 }} />
                          <button onClick={() => {
                            if (!apiKeyDraft.trim()) return;
                            saveSuggestApiKey(apiKeyDraft.trim());
                            setApiKey(apiKeyDraft.trim());
                            setApiKeyDraft(''); setShowKeyInput(false);
                          }} style={{ ...SMALL_BTN, background: '#004E38', color: '#fff', padding: '0 14px' }}>Save</button>
                        </div>
                      )}

                      {apiKey && !showKeyInput && (
                        <button onClick={handleGetSuggestions} disabled={loading} style={{
                          background: loading ? '#d8dcdb' : '#1565C0',
                          color: loading ? '#5f6d66' : '#fff',
                          border: 'none', borderRadius: 8, padding: '9px 16px',
                          fontWeight: 700, fontSize: 12,
                          cursor: loading ? 'not-allowed' : 'pointer',
                          width: '100%', marginBottom: suggestions.length || suggestError ? 10 : 0,
                        }}>
                          {loading ? '⏳ Asking Gemini...' : '✨ Generate Suggestions'}
                        </button>
                      )}

                      {suggestError && (
                        <div style={{ fontSize: 12, color: '#d32f2f', marginTop: 6, lineHeight: 1.5 }}>⚠ {suggestError}</div>
                      )}

                      {suggestions.map((s, i) => {
                        const sty = SUGGEST_COLORS[s.type] || SUGGEST_COLORS.change_room;
                        return (
                          <div key={i} style={{
                            background: sty.bg, border: `1px solid ${sty.border}`,
                            borderRadius: 8, padding: '10px 12px', marginBottom: 8,
                            display: 'flex', gap: 10, alignItems: 'flex-start',
                          }}>
                            <div style={{ fontSize: 18, flexShrink: 0 }}>{sty.icon}</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: sty.border, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{sty.label}</div>
                              <div style={{ fontSize: 12, color: '#333', lineHeight: 1.5 }}>{s.description}</div>
                            </div>
                            <button onClick={() => applySuggestion(s)} style={{
                              background: sty.border, color: '#fff', border: 'none',
                              borderRadius: 6, padding: '5px 12px', fontSize: 11,
                              fontWeight: 700, cursor: 'pointer', flexShrink: 0,
                            }}>Apply</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Add New Section ── */}
          <div style={{
            border: '1px solid #d8dcdb', borderRadius: 10,
            overflow: 'hidden', marginBottom: 14,
          }}>
            <button
              onClick={() => setShowAddSection(v => !v)}
              style={{
                width: '100%', padding: '11px 14px', background: '#f8faf9',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                fontFamily: "'Roboto', sans-serif", fontWeight: 700, fontSize: 13,
                color: '#004E38',
              }}
            >
              <span>➕ Add a New Section</span>
              <span style={{ color: '#5f6d66', fontSize: 16 }}>{showAddSection ? '▲' : '▼'}</span>
            </button>

            {showAddSection && (
              <div style={{ padding: 14, borderTop: '1px solid #d8dcdb', background: '#fff' }}>
                <p style={{ fontSize: 12, color: '#5f6d66', marginBottom: 10, lineHeight: 1.5 }}>
                  Creates <strong>{course.subject} {course.courseNo} Section {nextSection()}</strong>. Enrollment will be split between both sections.
                </p>

                {/* Enrollment split preview */}
                <div style={{
                  background: '#e3f2fd', border: '1px solid #1565C0',
                  borderRadius: 8, padding: '8px 12px', marginBottom: 12,
                  fontSize: 12, color: '#1565C0', lineHeight: 1.6,
                }}>
                  📊 <strong>Enrollment split:</strong> {course.enrolled} students →{' '}
                  Sec {course.section || '01'} keeps <strong>{course.enrolled - (Number(secEnrolled) || splitEnrolled)}</strong>,{' '}
                  new Sec {nextSection()} gets <strong>{Number(secEnrolled) || splitEnrolled}</strong>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={LABEL}>Room</label>
                    <input list="room-options-sec" value={secRoom} onChange={e => setSecRoom(e.target.value)} style={INPUT} placeholder="e.g. Miller 150" />
                    <datalist id="room-options-sec">
                      {allRooms.map(r => <option key={r} value={r} />)}
                    </datalist>
                  </div>
                  <div>
                    <label style={LABEL}>Days</label>
                    <select value={DAY_OPTIONS.includes(secDays) ? secDays : 'TR'} onChange={e => setSecDays(e.target.value)} style={INPUT}>
                      {DAY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={LABEL}>
                      Enrolled in new section
                    </label>
                    <input type="number" value={secEnrolled} onChange={e => setSecEnrolled(e.target.value)} style={INPUT} min={0} max={course.enrolled} />
                  </div>
                  <div>
                    <label style={LABEL}>Start Time</label>
                    <input type="time" value={minToTimeInput(secStartMin)} onChange={e => setSecStartMin(timeInputToMin(e.target.value))} style={INPUT} />
                  </div>
                  <div>
                    <label style={LABEL}>End Time</label>
                    <input type="time" value={minToTimeInput(secEndMin)} onChange={e => setSecEndMin(timeInputToMin(e.target.value))} style={INPUT} />
                  </div>
                  <div>
                    <label style={LABEL}>
                      Room Capacity {roomCapMap[secRoom] ? <span style={{ color: '#2e7d32', fontWeight: 400, textTransform: 'none' }}>· auto-filled</span> : ''}
                    </label>
                    <input type="number" value={secCapacity} onChange={e => setSecCapacity(e.target.value)} style={INPUT} min={0} />
                  </div>
                </div>
                <button
                  onClick={handleAddSection}
                  disabled={!secRoom || secStartMin == null || secEndMin == null}
                  style={{
                    background: secRoom && secStartMin != null ? '#1565C0' : '#d8dcdb',
                    color: secRoom && secStartMin != null ? '#fff' : '#5f6d66',
                    border: 'none', borderRadius: 8, padding: '8px 16px',
                    fontWeight: 700, fontSize: 12, cursor: secRoom ? 'pointer' : 'not-allowed',
                    width: '100%',
                  }}
                >
                  Add Section {nextSection()} & Split Enrollment
                </button>
              </div>
            )}
          </div>

          {/* ── Footer buttons ── */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{
              flex: 1, padding: '10px', background: 'none',
              border: '1px solid #d8dcdb', borderRadius: 8,
              fontSize: 13, color: '#5f6d66', cursor: 'pointer', fontWeight: 600,
            }}>
              Cancel
            </button>
            <button onClick={handleSave} style={{
              flex: 2, padding: '10px', background: '#004E38',
              border: 'none', borderRadius: 8,
              fontSize: 13, color: '#fff', cursor: 'pointer', fontWeight: 700,
            }}>
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Style constants ───────────────────────────────────────────────────────────
const LABEL = {
  display: 'block', fontSize: 11, fontWeight: 700,
  color: '#5f6d66', textTransform: 'uppercase',
  letterSpacing: '0.08em', marginBottom: 5,
};

const INPUT = {
  width: '100%', boxSizing: 'border-box',
  padding: '8px 10px', borderRadius: 7,
  border: '1px solid #d8dcdb', outline: 'none',
  fontFamily: "'Roboto', sans-serif", fontSize: 13,
  color: '#004E38', background: '#fff',
  marginBottom: 0,
};

const SMALL_BTN = {
  background: '#f0f2f1', border: '1px solid #d8dcdb',
  borderRadius: 6, padding: '4px 10px',
  fontSize: 11, color: '#5f6d66', cursor: 'pointer', fontWeight: 600,
};
