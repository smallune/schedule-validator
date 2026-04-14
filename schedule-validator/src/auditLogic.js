// ─── HELPERS ────────────────────────────────────────────────────────────────
export function parseTime(ts) {
  if (!ts || ts === "-" || typeof ts !== "string") return [null, null];
  const raw = ts.trim().split(/\s+/)[0];
  const parts = raw.split("-");
  if (parts.length !== 2) return [null, null];
  try {
    const toMin = (s) => parseInt(s.slice(0, 2)) * 60 + parseInt(s.slice(2, 4));
    return [toMin(parts[0]), toMin(parts[1])];
  } catch { return [null, null]; }
}

export function daysOverlap(d1, d2) {
  if (!d1 || !d2) return false;
  const s1 = new Set(String(d1).replace(/\s/g, "").split(""));
  return String(d2).replace(/\s/g, "").split("").some((c) => s1.has(c));
}

export function runAudit(schedule, opts) {
  const capacity = [], roomConflicts = [], profConflicts = [], tbaCourses = [],
        missingInstr = [], backToBack = [], weekendCourses = [];

  // Preprocess times and basic checks
  const rows = schedule.map((row) => {
    const [s, e] = parseTime(row["Timeslot 1"] || row["Time"] || "");
    const enrl = Number(row["Adj. Enrl"] ?? row["Enrolled"] ?? 0);
    const cap = Number(row["Room Cap"] ?? row["Capacity"] ?? 0);
    const room = String(row["Room"] || "").trim();
    const days = String(row["Days 1"] ?? row["Days"] ?? "").trim();
    const instr = String(row["Instr Last"] ?? row["Instructor"] ?? "").trim();
    const course = `${row["Subject"] || ""} ${row["Course No"] || ""}`.trim();

    const processed = { ...row, _start: s, _end: e, _enrl: enrl, _cap: cap, _room: room, _days: days, _instr: instr, _course: course };

    // Capacity
    if (opts.capacity && enrl > 0 && cap > 0 && enrl > cap)
      capacity.push({ CRN: row["CRN"], Course: course, Room: room, Enrolled: enrl, Capacity: cap, Deficit: enrl - cap });

    // TBA rooms
    if (opts.tba && room.toLowerCase() === "tba")
      tbaCourses.push({ CRN: row["CRN"], Course: course, Instructor: instr, Days: days });

    // Missing instructor
    if (opts.missing && (!instr || instr === "-" || instr === "TBD"))
      missingInstr.push({ CRN: row["CRN"], Course: course, Room: room, Days: days });

    // Weekend courses
    if (opts.weekend && /[SU]/.test(days))
      weekendCourses.push({ CRN: row["CRN"], Course: course, Instructor: instr, Days: days, Timeslot: row["Timeslot 1"] || "" });

    return processed;
  });

  // Optimize conflict detection using grouping
  const roomGroups = {};
  const profGroups = {};

  rows.forEach(row => {
    if (row._start === null || row._end === null) return;
    
    // Room Conflicts
    if (opts.rooms && row._room && row._room !== "-" && row._room.toLowerCase() !== "tba") {
      if (!roomGroups[row._room]) roomGroups[row._room] = [];
      roomGroups[row._room].forEach(r2 => {
        if (daysOverlap(row._days, r2._days) && row._start < r2._end && row._end > r2._start) {
          roomConflicts.push({ Room: row._room, "CRN 1": r2["CRN"], "Course 1": r2._course, "CRN 2": row["CRN"], "Course 2": row._course });
        }
      });
      roomGroups[row._room].push(row);
    }

    // Prof Conflicts & Back-to-Back
    if ((opts.prof || opts.backToBack) && row._instr && row._instr !== "-" && row._instr.toLowerCase() !== "tbd") {
      if (!profGroups[row._instr]) profGroups[row._instr] = [];
      profGroups[row._instr].forEach(r2 => {
        if (!daysOverlap(row._days, r2._days)) return;
        
        // Overlap
        if (opts.prof && row._start < r2._end && row._end > r2._start) {
          profConflicts.push({ Instructor: row._instr, "CRN 1": r2["CRN"], "Course 1": r2._course, "CRN 2": row["CRN"], "Course 2": row._course });
        }
        
        // Back-to-Back
        if (opts.backToBack) {
          const gap = Math.min(Math.abs(row._start - r2._end), Math.abs(r2._start - row._end));
          if (gap < 15) {
            // Ensure they aren't actually overlapping (already caught above)
            if (!(row._start < r2._end && row._end > r2._start)) {
              backToBack.push({ Instructor: row._instr, "CRN 1": r2["CRN"], "Course 1": r2._course, "CRN 2": row["CRN"], "Course 2": row._course, "Gap (min)": gap });
            }
          }
        }
      });
      profGroups[row._instr].push(row);
    }
  });

  return { capacity, roomConflicts, profConflicts, tbaCourses, missingInstr, backToBack, weekendCourses };
}
