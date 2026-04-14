import { useState, useRef, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import { parseTime, daysOverlap, runAudit } from "./auditLogic";
import ScheduleGrid from "./ScheduleGrid.jsx";

// ─── PALETTE & FONTS ────────────────────────────────────────────────────────
const STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Aleo:ital,wght@0,300;0,400;0,700;1,300;1,400;1,700&family=Roboto:ital,wght@0,300;0,400;0,500;0,700;1,300;1,400;1,500;1,700&family=Roboto+Mono:wght@300;400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #ffffff;
    --surface: #f8faf9;
    --surface2: #eff3f1;
    --border: #d8dcdb; /* W&M Silver */
    --gold: #B79257; /* W&M Gold */
    --gold2: #F0B323; /* Spirit Gold */
    --silver: #D8DCDB;
    --red: #d32f2f;
    --red2: #f44336;
    --green: #2e7d32;
    --blue: #1976d2;
    --lavender: #673ab7;
    --text: #004E38; /* W&M Green */
    --muted: #5f6d66;
    --radius: 12px;
  }

  body { background: var(--bg); color: var(--text); font-family: 'Roboto', sans-serif; -webkit-font-smoothing: antialiased; }

  .app {
    min-height: 100vh;
    background: var(--bg);
    background-image:
      radial-gradient(ellipse 80% 40% at 50% -10%, rgba(183,146,87,0.08) 0%, transparent 70%),
      repeating-linear-gradient(0deg, transparent, transparent 59px, rgba(0,78,56,0.03) 60px),
      repeating-linear-gradient(90deg, transparent, transparent 59px, rgba(0,78,56,0.02) 60px);
    padding: 0 0 80px;
  }

  /* HEADER */
  .header {
    text-align: center;
    padding: 64px 20px 48px;
    position: relative;
  }
  .header::after {
    content:'';
    display:block;
    width:160px; height:2px;
    background: linear-gradient(90deg, transparent, var(--gold), transparent);
    margin: 24px auto 0;
  }
  .header-badge {
    display: inline-flex; align-items: center; gap: 8px;
    background: rgba(183,146,87,0.1);
    border: 1px solid rgba(183,146,87,0.3);
    border-radius: 4px;
    padding: 6px 16px;
    font-size: 11px; font-family: 'Roboto Mono', monospace;
    color: var(--gold);
    letter-spacing: 0.12em; text-transform: uppercase;
    margin-bottom: 24px;
    font-weight: 700;
  }
  .header h1 {
    font-family: 'Aleo', serif;
    font-size: clamp(2.2rem, 6vw, 3.8rem);
    font-weight: 700;
    color: var(--text);
    line-height: 1.1;
    letter-spacing: -0.01em;
  }
  .header h1 span { color: var(--gold); }
  .header p {
    color: var(--muted); margin-top: 16px;
    font-size: 16px; line-height: 1.6; max-width: 580px; margin-left:auto; margin-right:auto;
    font-weight: 400;
  }

  /* MAIN CONTENT */
  .container { max-width: 1040px; margin: 0 auto; padding: 0 32px; }

  /* DROP ZONE */
  .dropzone {
    border: 2px dashed var(--border);
    border-radius: var(--radius);
    padding: 56px 32px;
    text-align: center;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    background: var(--surface);
    position: relative; overflow: hidden;
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  }
  .dropzone:hover { border-color: var(--gold); background: #fff; }
  .dropzone.over {
    border-color: var(--gold2);
    background: rgba(183,146,87,0.05);
    transform: translateY(-2px);
  }
  .dropzone.has-file { border-color: var(--gold); border-style: solid; }
  .dropzone-icon {
    font-size: 48px; line-height: 1; margin-bottom: 16px;
    display: block; opacity: 0.9;
  }
  .dropzone-title { font-family: 'Aleo', serif; font-size: 20px; font-weight: 700; color: var(--text); margin-bottom: 8px; }
  .dropzone-sub { font-size: 14px; color: var(--muted); }
  .dropzone-file {
    display: inline-flex; align-items: center; gap: 10px;
    background: rgba(183,146,87,0.08); border: 1px solid var(--gold);
    border-radius: 6px; padding: 10px 20px; margin-top: 18px;
    font-family: 'Roboto Mono', monospace; font-size: 13px; color: var(--gold);
    font-weight: 600;
  }

  /* OPTIONS */
  .options-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 16px; margin: 24px 0;
  }
  .option-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px; padding: 16px 18px;
    display: flex; align-items: center; gap: 14px;
    cursor: pointer; transition: all 0.2s;
    user-select: none;
  }
  .option-card:hover { border-color: var(--gold); background: #fff; }
  .option-card.on { border-color: var(--gold); background: #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
  .option-card .toggle {
    width: 40px; height: 22px; border-radius: 99px;
    background: #e0e6e4; position: relative;
    transition: background 0.2s; flex-shrink:0;
    border: 1px solid var(--border);
  }
  .option-card.on .toggle { background: var(--text); border-color: var(--text); }
  .option-card .toggle::after {
    content:''; position:absolute; top:3px; left:3px;
    width:14px; height:14px; border-radius:50%; background: #fff;
    transition: transform 0.2s;
  }
  .option-card.on .toggle::after { transform: translateX(18px); }
  .option-label { font-size: 14px; color: var(--text); font-weight: 600; }

  /* RUN BUTTON */
  .run-btn {
    width: 100%; height: 56px;
    background: linear-gradient(135deg, var(--text), #006b4d);
    border: none; border-radius: 10px;
    font-family: 'Aleo', serif; font-size: 17px; font-weight: 700;
    color: #fff; letter-spacing: 0.02em;
    cursor: pointer; transition: all 0.25s;
    position: relative; overflow: hidden;
    margin-top: 12px;
    box-shadow: 0 4px 15px rgba(0,78,56,0.2);
  }
  .run-btn:disabled { opacity: 0.3; cursor: not-allowed; box-shadow: none; filter: grayscale(0.5); }
  .run-btn:not(:disabled):hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 30px rgba(0,78,56,0.3);
    filter: brightness(1.1);
  }
  .run-btn .shimmer {
    position: absolute; inset: 0;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%);
    transform: translateX(-100%);
    animation: shimmer 2s infinite;
  }

  /* PROGRESS */
  .progress-bar-wrap {
    background: var(--surface2); border-radius: 6px;
    height: 8px; overflow: hidden; margin: 20px 0;
    border: 1px solid var(--border);
  }
  .progress-bar {
    height: 100%; background: linear-gradient(90deg, var(--gold), var(--gold2));
    border-radius: 6px; transition: width 0.4s ease;
  }
  .progress-label { font-family: 'Roboto Mono', monospace; font-size: 12px; color: var(--text); margin-bottom: 8px; font-weight: 700; }

  /* STATS ROW */
  .stats-row {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 16px; margin: 32px 0;
  }
  .stat-card {
    background: #fff; border: 1px solid var(--border);
    border-radius: var(--radius); padding: 24px;
    position: relative; overflow: hidden;
    animation: fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
    box-shadow: 0 4px 12px rgba(0,0,0,0.03);
  }
  .stat-card::before {
    content:''; position:absolute; top:0; left:0; right:0; height:3px;
  }
  .stat-card.red::before { background: var(--red); }
  .stat-card.gold::before { background: var(--gold); }
  .stat-card.green::before { background: var(--green); }
  .stat-card.blue::before { background: var(--blue); }
  .stat-card.lav::before { background: var(--lavender); }
  .stat-num {
    font-family: 'Aleo', serif;
    font-size: 2.8rem; font-weight: 700; line-height: 1;
    margin-bottom: 8px;
  }
  .stat-card.red .stat-num { color: var(--red); }
  .stat-card.gold .stat-num { color: var(--gold); }
  .stat-card.green .stat-num { color: var(--green); }
  .stat-card.blue .stat-num { color: var(--blue); }
  .stat-card.lav .stat-num { color: var(--lavender); }
  .stat-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; }

  /* TABS */
  .tabs { display: flex; gap: 6px; background: var(--surface2); border-radius: 12px; padding: 6px; margin-bottom: 24px; flex-wrap: wrap; border: 1px solid var(--border); }
  .tab {
    flex: 1; min-width: 110px; padding: 10px 16px;
    border: none; border-radius: 8px; cursor: pointer;
    font-family: 'Roboto', sans-serif; font-size: 13px; font-weight: 700;
    background: transparent; color: var(--muted);
    transition: all 0.2s; white-space: nowrap; text-align: center;
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .tab:hover { color: var(--text); background: rgba(0,78,56,0.05); }
  .tab.active { background: #fff; color: var(--text); box-shadow: 0 4px 12px rgba(0,0,0,0.08); border: 1px solid var(--border); }
  .tab .badge {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 22px; height: 22px; border-radius: 4px; padding: 0 6px;
    font-size: 11px; font-weight: 700; font-family: 'Roboto Mono', monospace;
  }
  .tab.red-tab .badge { background: rgba(211,47,47,0.1); color: var(--red); }
  .tab.gold-tab .badge { background: rgba(183,146,87,0.1); color: var(--gold); }
  .tab.blue-tab .badge { background: rgba(25,118,210,0.1); color: var(--blue); }
  .tab.lav-tab .badge { background: rgba(103,58,183,0.1); color: var(--lavender); }
  .tab.green-tab .badge { background: rgba(46,125,50,0.1); color: var(--green); }

  /* TABLE */
  .table-wrap {
    background: #fff; border: 1px solid var(--border);
    border-radius: var(--radius); overflow: hidden;
    animation: fadeUp 0.4s ease-out;
    box-shadow: 0 10px 40px rgba(0,0,0,0.05);
  }
  .table-search {
    padding: 16px 24px; border-bottom: 1px solid var(--border);
    display: flex; gap: 16px; align-items: center; flex-wrap: wrap;
    background: var(--surface);
  }
  .search-input {
    flex: 1; min-width: 240px;
    background: #fff; border: 1px solid var(--border);
    border-radius: 8px; padding: 10px 16px;
    font-family: 'Roboto Mono', monospace; font-size: 13px;
    color: var(--text); outline: none;
    transition: all 0.2s;
  }
  .search-input:focus { border-color: var(--gold); box-shadow: 0 0 0 3px rgba(183,146,87,0.1); }
  .search-input::placeholder { color: var(--muted); }
  .row-count { font-family: 'Roboto Mono', monospace; font-size: 12px; color: var(--muted); font-weight: 700; }
  table { width: 100%; border-collapse: collapse; }
  thead { background: var(--surface2); }
  th {
    text-align: left; padding: 14px 20px;
    font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.12em;
    color: var(--text); border-bottom: 1px solid var(--border);
    cursor: pointer; user-select: none; white-space: nowrap;
    opacity: 0.8;
  }
  th:hover { color: var(--gold); opacity: 1; background: #fff; }
  td {
    padding: 14px 20px; font-size: 13px;
    border-bottom: 1px solid var(--surface2);
    font-family: 'Roboto Mono', monospace;
    max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    color: #333;
  }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: var(--surface); color: var(--text); }
  .cell-red { color: var(--red); font-weight: 700; }
  .cell-gold { color: var(--gold); font-weight: 700; }
  .cell-green { color: var(--green); font-weight: 700; }
  .cell-blue { color: var(--blue); font-weight: 700; }
  .pill {
    display: inline-block; padding: 2px 10px; border-radius: 4px;
    font-size: 11px; font-weight: 700; text-transform: uppercase;
  }
  .pill-red { background: rgba(211,47,47,0.1); color: var(--red); border: 1px solid rgba(211,47,47,0.2); }
  .pill-gold { background: rgba(183,146,87,0.1); color: var(--gold); border: 1px solid rgba(183,146,87,0.2); }
  .pill-green { background: rgba(46,125,50,0.1); color: var(--green); border: 1px solid rgba(46,125,50,0.2); }

  /* SECTION HEADING */
  .section-heading {
    display: flex; align-items: center; gap: 16px;
    margin: 40px 0 20px;
  }
  .section-heading h2 {
    font-family: 'Aleo', serif; font-size: 1.5rem; font-weight: 700; color: var(--text); letter-spacing: -0.01em;
  }
  .section-heading .line { flex:1; height:1px; background: var(--border); }

  /* EXPORT BTN */
  .export-btn {
    display: inline-flex; align-items: center; gap: 8px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 8px; padding: 10px 20px;
    font-family: 'Roboto', sans-serif; font-size: 13px; font-weight: 700;
    color: var(--gold); cursor: pointer; transition: all 0.2s;
  }
  .export-btn:hover { border-color: var(--gold); background: var(--surface2); transform: translateY(-1px); }

  /* CHART */
  .mini-chart { display: flex; align-items: flex-end; gap: 10px; height: 80px; padding: 0 8px; }
  .bar-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .bar-fill {
    width: 100%; border-radius: 3px 3px 0 0;
    transition: height 1s cubic-bezier(0.34, 1.56, 0.64, 1);
    box-shadow: inset 0 1px 1px rgba(255,255,255,0.2);
  }
  .bar-val { font-family: 'Roboto Mono', monospace; font-size: 11px; color: var(--muted); font-weight: 500; }

  /* SCROLLBAR */
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: #001a12; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--gold); }
`;

// ─── COMPONENTS ─────────────────────────────────────────────────────────────
function SortableTable({ data, color = "gold" }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: null, dir: 1 });

  if (!data || data.length === 0)
    return (
      <div className="table-wrap">
        <div className="empty"><div className="empty-icon">✓</div>No issues found — all clear!</div>
      </div>
    );

  const cols = Object.keys(data[0]);
  const filtered = data.filter((row) =>
    cols.some((c) => String(row[c] ?? "").toLowerCase().includes(search.toLowerCase()))
  );
  const sorted = sort.key
    ? [...filtered].sort((a, b) => String(a[sort.key] ?? "").localeCompare(String(b[sort.key] ?? ""), undefined, { numeric: true }) * sort.dir)
    : filtered;

  const cellClass = (col, val) => {
    if (col.toLowerCase().includes("deficit") || col.toLowerCase().includes("conflict")) return `cell-${color}`;
    if (col.toLowerCase().includes("enrolled") && Number(val) > 0) return "cell-red";
    if (col.toLowerCase().includes("capacity")) return "cell-muted";
    return "";
  };

  return (
    <div className="table-wrap">
      <div className="table-search">
        <input className="search-input" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="row-count">{sorted.length} / {data.length} rows</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c} onClick={() => setSort(s => ({ key: c, dir: s.key === c ? -s.dir : 1 }))}>
                  {c} {sort.key === c ? (sort.dir === 1 ? "↑" : "↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c} className={cellClass(c, row[c])} title={String(row[c] ?? "")}>
                    {c.toLowerCase().includes("deficit")
                      ? <span className={`pill pill-${color}`}>+{row[c]}</span>
                      : String(row[c] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── MAIN APP ───────────────────────────────────────────────────────────────
export default function App() {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState("capacity");
  const [rawSchedule, setRawSchedule] = useState(null);
  const [savedSchedule, setSavedSchedule] = useState(null);
  const [editHistory, setEditHistory]     = useState([]);
  const [viewMode, setViewMode] = useState("audit");
  const inputRef = useRef();

  const [opts, setOpts] = useState({
    capacity: true, rooms: true, prof: true, tba: true,
    missing: true, backToBack: true, weekend: false,
  });

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }, []);

  const handleFileInput = (e) => { if (e.target.files[0]) setFile(e.target.files[0]); };

  const toggle = (key) => setOpts((o) => ({ ...o, [key]: !o[key] }));

  const handleUpdateRow = (idx, updates) => {
    setEditHistory(h => [...h, rawSchedule]);
    setRawSchedule(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...updates };
      return next;
    });
  };

  const handleAddRow = (newRow) => {
    setEditHistory(h => [...h, rawSchedule]);
    setRawSchedule(prev => [...prev, newRow]);
  };

  const handleUndo = () => {
    if (editHistory.length === 0) return;
    const prev = editHistory[editHistory.length - 1];
    setEditHistory(h => h.slice(0, -1));
    setRawSchedule(prev);
  };

  const hasUnsavedChanges = savedSchedule && rawSchedule && rawSchedule !== savedSchedule;

  const exportEditedSchedule = () => {
    if (!rawSchedule) return;
    // Strip internal parsed fields — only export original schedule columns
    const INTERNAL = new Set([
      // Internal parsed fields added during schedule processing
      'idx','start','end','days','dayTab','room','subject',
      'courseNo','section','title','instructor','enrolled','capacity','crn',
      // Alias columns added by the editor — original file uses Days 1 / Timeslot 1 / Room Cap / Section No
      'Days','Time','Capacity','Section',
    ]);
    const cols = [...new Set(rawSchedule.flatMap(r => Object.keys(r)))]
      .filter(c => !INTERNAL.has(c));
    const csv = [
      cols.join(','),
      ...rawSchedule.map(r => cols.map(c => `"${r[c] ?? ''}"`).join(','))
    ].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv,' + encodeURIComponent(csv);
    a.download = 'edited_schedule.csv';
    a.click();
  };

  const runAuditUI = async () => {
    if (!file) return;
    setRunning(true); setResults(null); setProgress(0);

    await new Promise(r => setTimeout(r, 50));

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        setProgressLabel("Reading file…"); setProgress(15);
        await new Promise(r => setTimeout(r, 200));

        let schedule;
        if (file.name.endsWith(".csv")) {
          const text = new TextDecoder().decode(e.target.result);
          const lines = text.split("\n").filter(Boolean);
          const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
          schedule = lines.slice(1).map(line => {
            const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
            return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
          });
        } else {
          const wb = XLSX.read(e.target.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          
          // Optimization: If range is huge, shrink it to actual used rows
          const range = XLSX.utils.decode_range(ws['!ref']);
          if (range.e.r > 10000) {
            let lastRow = 0;
            // Scan backwards to find last row with data in the first 10 columns
            for (let r = Math.min(range.e.r, 100000); r >= 0; r--) {
              let hasData = false;
              for (let c = 0; c < 10; c++) {
                const cell = ws[XLSX.utils.encode_cell({r, c})];
                if (cell && cell.v !== undefined && cell.v !== null && cell.v !== "") { hasData = true; break; }
              }
              if (hasData) { lastRow = r; break; }
            }
            if (lastRow > 0) {
              range.e.r = lastRow;
              ws['!ref'] = XLSX.utils.encode_range(range);
            }
          }
          
          schedule = XLSX.utils.sheet_to_json(ws);
        }

        setProgressLabel("Checking capacity…"); setProgress(35);
        await new Promise(r => setTimeout(r, 300));
        setProgressLabel("Scanning room conflicts…"); setProgress(55);
        await new Promise(r => setTimeout(r, 300));
        setProgressLabel("Analysing instructor schedules…"); setProgress(75);
        await new Promise(r => setTimeout(r, 300));
        setProgressLabel("Running extra checks…"); setProgress(90);
        await new Promise(r => setTimeout(r, 200));

        setRawSchedule(schedule);
        setSavedSchedule(schedule);
        setEditHistory([]);
        const res = runAudit(schedule, opts);
        setProgress(100);
        setProgressLabel("Complete!");
        await new Promise(r => setTimeout(r, 300));
        setResults(res);
        setActiveTab("capacity");
      } catch (err) {
        setProgressLabel(`Error: ${err.message}`);
      } finally {
        setRunning(false);
      }
    };

    if (file.name.endsWith(".csv")) reader.readAsArrayBuffer(file);
    else reader.readAsArrayBuffer(file);
  };

  const exportCSV = () => {
    if (!results) return;
    const tab = activeTab;
    const map = { capacity: results.capacity, rooms: results.roomConflicts, prof: results.profConflicts, tba: results.tbaCourses, missing: results.missingInstr, backToBack: results.backToBack, weekend: results.weekendCourses };
    const data = map[tab];
    if (!data?.length) return;
    const cols = Object.keys(data[0]);
    const csv = [cols.join(","), ...data.map(r => cols.map(c => `"${r[c] ?? ""}"`).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv," + encodeURIComponent(csv);
    a.download = `${tab}_audit.csv`; a.click();
  };

  const TABS = [
    { key: "capacity", label: "Capacity", color: "red-tab", count: results?.capacity.length },
    { key: "rooms", label: "Rooms", color: "gold-tab", count: results?.roomConflicts.length },
    { key: "prof", label: "Instructors", color: "blue-tab", count: results?.profConflicts.length },
    { key: "tba", label: "TBA Rooms", color: "lav-tab", count: results?.tbaCourses.length },
    { key: "missing", label: "No Instructor", color: "red-tab", count: results?.missingInstr.length },
    { key: "backToBack", label: "Back-to-Back", color: "gold-tab", count: results?.backToBack.length },
    { key: "weekend", label: "Weekend", color: "green-tab", count: results?.weekendCourses.length },
  ];

  const OPTS = [
    { key: "capacity", label: "Capacity Violations" },
    { key: "rooms", label: "Room Double-Bookings" },
    { key: "prof", label: "Instructor Overlaps" },
    { key: "tba", label: "TBA Rooms" },
    { key: "missing", label: "Missing Instructors" },
    { key: "backToBack", label: "Back-to-Back (<15min)" },
    { key: "weekend", label: "Weekend Sections" },
  ];

  const activeData = results ? {
    capacity: results.capacity, rooms: results.roomConflicts,
    prof: results.profConflicts, tba: results.tbaCourses,
    missing: results.missingInstr, backToBack: results.backToBack,
    weekend: results.weekendCourses
  }[activeTab] : [];

  const activeColor = { capacity: "red", rooms: "gold", prof: "blue", tba: "lav", missing: "red", backToBack: "gold", weekend: "green" }[activeTab];

  const totalIssues = results ? Object.values(results).reduce((a, v) => a + v.length, 0) : 0;

  return (
    <>
      <style>{STYLE}</style>
      <div className="app">
        <div className="header">
          <div className="header-badge">W&M Registrar Auditing Tool</div>
          <h1>Schedule <span>Conflict</span> Validator</h1>
          <p>Maintain the integrity of the William & Mary course catalog. Upload your schedule to detect capacity overloads, room conflicts, and instructor overlaps.</p>
        </div>

        <div className="container">
          {/* DROP ZONE */}
          <div
            className={`dropzone${dragging ? " over" : ""}${file ? " has-file" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current.click()}
          >
            <input ref={inputRef} type="file" accept=".xlsx,.csv" style={{ display: "none" }} onChange={handleFileInput} />
            {file ? (
              <>
                <span className="dropzone-icon">📄</span>
                <div className="dropzone-title">File Ready</div>
                <div className="dropzone-file">✓ {file.name}</div>
                <div className="dropzone-sub" style={{ marginTop: 8 }}>Click to replace</div>
              </>
            ) : (
              <>
                <span className="dropzone-icon">📂</span>
                <div className="dropzone-title">Drop your schedule file here</div>
                <div className="dropzone-sub">Supports .xlsx and .csv · Click to browse</div>
              </>
            )}
          </div>

          {/* AUDIT OPTIONS */}
          <div className="section-heading">
            <h2>Audit Checks</h2><div className="line" />
          </div>
          <div className="options-grid">
            {OPTS.map(({ key, label }) => (
              <div key={key} className={`option-card${opts[key] ? " on" : ""}`} onClick={() => toggle(key)}>
                <div className="toggle" />
                <span className="option-label">{label}</span>
              </div>
            ))}
          </div>

          {/* RUN BUTTON */}
          <button className="run-btn" disabled={!file || running} onClick={runAuditUI}>
            {running ? <div className="shimmer" /> : null}
            {running ? progressLabel || "Running…" : "Run Audit →"}
          </button>

          {/* PROGRESS */}
          {running && (
            <div>
              <div className="progress-label">{progressLabel}</div>
              <div className="progress-bar-wrap"><div className="progress-bar" style={{ width: `${progress}%` }} /></div>
            </div>
          )}

          {/* VIEW MODE TOGGLE */}
          {results && (
            <div style={{ display: "flex", gap: 6, background: "var(--surface2)", borderRadius: 12, padding: 6, marginTop: 36, marginBottom: 8, border: "1px solid var(--border)" }}>
              {[
                { key: "audit", icon: "📊", label: "Audit Results"  },
                { key: "grid",  icon: "🗓️", label: "Schedule Grid" },
              ].map(({ key, icon, label }) => (
                <button key={key} onClick={() => setViewMode(key)} style={{
                  flex: 1, padding: "11px 16px",
                  border: viewMode === key ? "1px solid var(--border)" : "none",
                  borderRadius: 8, cursor: "pointer",
                  fontFamily: "'Roboto', sans-serif", fontSize: 14, fontWeight: 700,
                  background: viewMode === key ? "#fff" : "transparent",
                  color: viewMode === key ? "var(--text)" : "var(--muted)",
                  boxShadow: viewMode === key ? "0 4px 12px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}>
                  {icon} {label}
                </button>
              ))}
            </div>
          )}

          {/* RESULTS */}
          {results && viewMode === "audit" && (
            <>
              <div className="section-heading" style={{ marginTop: 20 }}>
                <h2>Audit Results</h2><div className="line" />
                <button className="export-btn" onClick={exportCSV}>↓ Export CSV</button>
              </div>

              {/* STATS */}
              <div className="stats-row">
                <div className="stat-card red" style={{ animationDelay: "0ms" }}>
                  <div className="stat-num">{results.capacity.length}</div>
                  <div className="stat-label">Capacity Issues</div>
                </div>
                <div className="stat-card gold" style={{ animationDelay: "60ms" }}>
                  <div className="stat-num">{results.roomConflicts.length}</div>
                  <div className="stat-label">Room Conflicts</div>
                </div>
                <div className="stat-card blue" style={{ animationDelay: "120ms" }}>
                  <div className="stat-num">{results.profConflicts.length}</div>
                  <div className="stat-label">Instructor Overlaps</div>
                </div>
                <div className="stat-card lav" style={{ animationDelay: "180ms" }}>
                  <div className="stat-num">{results.tbaCourses.length}</div>
                  <div className="stat-label">TBA Rooms</div>
                </div>
                <div className="stat-card green" style={{ animationDelay: "240ms" }}>
                  <div className="stat-num">{results.missingInstr.length + results.backToBack.length + results.weekendCourses.length}</div>
                  <div className="stat-label">Other Issues</div>
                </div>
                <div className="stat-card gold" style={{ animationDelay: "300ms" }}>
                  <div className="stat-num">{totalIssues}</div>
                  <div className="stat-label">Total Findings</div>
                </div>
              </div>

              {/* CHART */}
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px 24px", marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, fontWeight: 600 }}>Issue Breakdown</div>
                <div className="mini-chart">
                  {[
                    { label: "Cap", val: results.capacity.length, color: "var(--red2)" },
                    { label: "Rooms", val: results.roomConflicts.length, color: "var(--gold2)" },
                    { label: "Prof", val: results.profConflicts.length, color: "var(--blue)" },
                    { label: "TBA", val: results.tbaCourses.length, color: "var(--lavender)" },
                    { label: "No Instr", val: results.missingInstr.length, color: "var(--red)" },
                    { label: "B2B", val: results.backToBack.length, color: "var(--gold)" },
                    { label: "Wknd", val: results.weekendCourses.length, color: "var(--green)" },
                  ].map(({ label, val, color }) => {
                    const max = Math.max(1, ...Object.values(results).map(v => v.length));
                    const pct = (val / max) * 100;
                    return (
                      <div className="bar-item" key={label}>
                        <div className="bar-val">{val}</div>
                        <div className="bar-fill" style={{ height: `${Math.max(pct, val > 0 ? 8 : 2)}%`, background: color, opacity: val > 0 ? 1 : 0.15 }} />
                        <div className="bar-val">{label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* TABS + TABLE */}
              <div className="tabs">
                {TABS.map(({ key, label, color, count }) => (
                  <button key={key} className={`tab ${color}${activeTab === key ? " active" : ""}`} onClick={() => setActiveTab(key)}>
                    {label}
                    {count !== undefined && <span className="badge">{count}</span>}
                  </button>
                ))}
              </div>

              <SortableTable data={activeData} color={activeColor} />
            </>
          )}

          {/* GRID VIEW */}
          {results && viewMode === "grid" && rawSchedule && (
            <>
              {hasUnsavedChanges && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'rgba(183,146,87,0.08)', border: '1px solid rgba(183,146,87,0.3)',
                  borderRadius: 10, padding: '10px 16px', marginBottom: 12, flexWrap: 'wrap', gap: 10,
                }}>
                  <span style={{ fontSize: 13, color: 'var(--gold)', fontWeight: 600 }}>
                    ✏️ You have unsaved edits — {editHistory.length} change{editHistory.length !== 1 ? 's' : ''}
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleUndo} disabled={editHistory.length === 0} style={{
                      background: 'none', border: '1px solid var(--border)', borderRadius: 7,
                      padding: '5px 14px', fontSize: 12, fontWeight: 600,
                      color: editHistory.length > 0 ? 'var(--text)' : 'var(--muted)',
                      cursor: editHistory.length > 0 ? 'pointer' : 'not-allowed',
                    }}>
                      ↩ Undo
                    </button>
                    <button onClick={exportEditedSchedule} style={{
                      background: 'var(--gold)', color: '#fff', border: 'none',
                      borderRadius: 7, padding: '5px 14px', fontSize: 12,
                      fontWeight: 700, cursor: 'pointer',
                    }}>
                      ↓ Export Edited Schedule
                    </button>
                  </div>
                </div>
              )}
              <ScheduleGrid
                schedule={rawSchedule}
                onUpdateRow={handleUpdateRow}
                onAddRow={handleAddRow}
              />
            </>
          )}

        </div>
      </div>
    </>
  );
}
