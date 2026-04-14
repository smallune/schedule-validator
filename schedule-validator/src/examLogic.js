// ─── HELPERS ─────────────────────────────────────────────────────────────────

const toMin = (h, m) => h * 60 + m;

// Canonical day order: M=0 T=1 W=2 R=3 F=4
const DAY_ORD = { M: 0, T: 1, W: 2, R: 3, F: 4 };

export function canon(days) {
  return String(days || "")
    .toUpperCase()
    .replace(/[^MTWRF]/g, "")
    .split("")
    .filter(c => DAY_ORD[c] !== undefined)
    .sort((a, b) => DAY_ORD[a] - DAY_ORD[b])
    .join("");
}

// ─── MATCHING ────────────────────────────────────────────────────────────────

function ruleMatches(course, rule) {
  const cd = canon(course.days);
  const cs = course.start; // minutes from midnight, or null

  switch (rule.type) {
    case "courses":
      // Named course override
      return rule.list.some(
        e => e.sub.toUpperCase() === course.subject.toUpperCase()
          && e.nos.includes(String(course.courseNo))
      );

    case "noRegular":
      // Courses with no timeslot at all
      return cs === null;

    case "exact":
      // Exact start time + one of the day patterns
      if (cs === null || cs !== rule.start) return false;
      return rule.days.some(d => canon(d) === cd);

    case "gte":
      // Start time >= threshold + one of the day patterns
      if (cs === null || cs < rule.start) return false;
      return rule.days.some(d => canon(d) === cd);

    default:
      return false;
  }
}

/** Returns first matching slot descriptor, or null */
export function matchExam(course, schedule) {
  for (const rule of schedule.rules) {
    if (ruleMatches(course, rule)) {
      return {
        slotId:  `${rule.day}_${rule.period}`,
        dayId:   rule.day,
        period:  rule.period,
        note:    rule.note || "",
        isOverride: rule.match?.type === "courses",
      };
    }
  }
  return null;
}

/** Returns { map: { slotId → [courses] }, unmatched: [courses] } */
export function buildExamMap(courses, schedule) {
  const map = {};
  const unmatched = [];

  // Pre-populate all slots
  schedule.examDays.forEach(d =>
    [1, 2, 3].forEach(p => { map[`${d.id}_${p}`] = []; })
  );

  courses.forEach(course => {
    const slot = matchExam(course, schedule);
    if (slot) {
      map[slot.slotId].push({ ...course, _slot: slot });
    } else if (course.start !== null) {
      unmatched.push(course); // has a time but no rule matched
    }
    // courses with no time and no noRegular rule → silently ignored
  });

  return { map, unmatched };
}

// ─── EXAM SCHEDULE DATA ───────────────────────────────────────────────────────
// Rules are evaluated in order — FIRST match wins.
// Order: specific course overrides → exact time → "or later" time → no-regular

export const FALL_2026 = {
  semester: "Fall 2026",
  periods: {
    1: { label: "1st Period",  time: "9:00 AM – 12:00 PM" },
    2: { label: "2nd Period",  time: "2:00 PM – 5:00 PM"  },
    3: { label: "3rd Period",  time: "7:00 PM – 10:00 PM" },
  },
  examDays: [
    { id: "dec7",  date: "December 7",  day: "Monday"    },
    { id: "dec8",  date: "December 8",  day: "Tuesday"   },
    { id: "dec9",  date: "December 9",  day: "Wednesday" },
    { id: "dec10", date: "December 10", day: "Thursday"  },
    { id: "dec11", date: "December 11", day: "Friday"    },
    { id: "dec14", date: "December 14", day: "Monday"    },
    { id: "dec15", date: "December 15", day: "Tuesday"   },
  ],
  rules: [
    // ── Named overrides ────────────────────────────────────────────────────
    { day: "dec7",  period: 3,
      note: "Modern Languages 101, 103, 201, 203",
      match: { type: "courses", list: [
        { sub: "MLNG", nos: ["101","103","201","203"] },
        { sub: "FREN", nos: ["101","103","201","203"] },
        { sub: "GERM", nos: ["101","103","201","203"] },
        { sub: "SPAN", nos: ["101","103","201","203"] },
      ]}},
    { day: "dec8",  period: 3,
      note: "BUAD 350 · CHEM 207",
      match: { type: "courses", list: [
        { sub: "BUAD", nos: ["350"] },
        { sub: "CHEM", nos: ["207"] },
      ]}},
    { day: "dec9",  period: 3,
      note: "MATH 104, 106, 111, 112, 212, 351, 352, 451, 452",
      match: { type: "courses", list: [
        { sub: "MATH", nos: ["104","106","111","112","212","351","352","451","452"] },
      ]}},
    { day: "dec10", period: 3,
      note: "BUAD 323 · CSCI 141",
      match: { type: "courses", list: [
        { sub: "BUAD", nos: ["323"] },
        { sub: "CSCI", nos: ["141"] },
      ]}},
    { day: "dec11", period: 3,
      note: "BIOL 203 · BUAD 231",
      match: { type: "courses", list: [
        { sub: "BIOL", nos: ["203"] },
        { sub: "BUAD", nos: ["231"] },
      ]}},

    // ── Exact time + day pattern ───────────────────────────────────────────
    { day: "dec7",  period: 1, note: "12:00 noon MWF",
      match: { type: "exact", start: toMin(12, 0),  days: ["MWF"] }},
    { day: "dec7",  period: 2, note: "11:00 a.m. TR",
      match: { type: "exact", start: toMin(11, 0),  days: ["TR"] }},
    { day: "dec8",  period: 1, note: "8:00 a.m. MWF",
      match: { type: "exact", start: toMin(8,  0),  days: ["MWF"] }},
    { day: "dec8",  period: 2, note: "2:00 p.m. MW / MF / MWF / WF",
      match: { type: "exact", start: toMin(14, 0),  days: ["MW","MF","MWF","WF"] }},
    { day: "dec9",  period: 1, note: "12:30 p.m. TR",
      match: { type: "exact", start: toMin(12,30),  days: ["TR"] }},
    { day: "dec9",  period: 2, note: "1:00 p.m. MWF",
      match: { type: "exact", start: toMin(13, 0),  days: ["MWF"] }},
    { day: "dec10", period: 1, note: "9:30 a.m. TR",
      match: { type: "exact", start: toMin(9, 30),  days: ["TR"] }},
    { day: "dec10", period: 2, note: "2:00 p.m. TR",
      match: { type: "exact", start: toMin(14, 0),  days: ["TR"] }},
    { day: "dec11", period: 1, note: "11:00 a.m. MWF",
      match: { type: "exact", start: toMin(11, 0),  days: ["MWF"] }},
    { day: "dec11", period: 2, note: "8:00 a.m. TR",
      match: { type: "exact", start: toMin(8,  0),  days: ["TR"] }},
    { day: "dec14", period: 1, note: "9:00 a.m. MWF",
      match: { type: "exact", start: toMin(9,  0),  days: ["MWF"] }},
    { day: "dec14", period: 2, note: "3:30 p.m. TR",
      match: { type: "exact", start: toMin(15,30),  days: ["TR"] }},
    { day: "dec15", period: 1, note: "3:30 p.m. MW / MF / MWF / WF",
      match: { type: "exact", start: toMin(15,30),  days: ["MW","MF","MWF","WF"] }},
    { day: "dec15", period: 2, note: "10:00 a.m. MWF",
      match: { type: "exact", start: toMin(10, 0),  days: ["MWF"] }},

    // ── "Or later" catch-ups ──────────────────────────────────────────────
    { day: "dec10", period: 3, note: "5:00 p.m. or later — MW or TR",
      match: { type: "gte", start: toMin(17, 0),  days: ["MW","TR"] }},
    { day: "dec11", period: 3, note: "2:00 p.m. or later — F only",
      match: { type: "gte", start: toMin(14, 0),  days: ["F"] }},
    { day: "dec14", period: 3, note: "3:30 p.m. or later — single day (M / T / W / R)",
      match: { type: "gte", start: toMin(15,30),  days: ["M","T","W","R"] }},

    // ── No regular meeting time ───────────────────────────────────────────
    { day: "dec15", period: 3, note: "No regular meeting days / times",
      match: { type: "noRegular" }},
  ],
};

export const SPRING_2026 = {
  semester: "Spring 2026",
  periods: {
    1: { label: "1st Period",  time: "9:00 AM – 12:00 PM" },
    2: { label: "2nd Period",  time: "2:00 PM – 5:00 PM"  },
    3: { label: "3rd Period",  time: "7:00 PM – 10:00 PM" },
  },
  examDays: [
    { id: "may4",  date: "May 4",  day: "Monday"    },
    { id: "may5",  date: "May 5",  day: "Tuesday"   },
    { id: "may6",  date: "May 6",  day: "Wednesday" },
    { id: "may7",  date: "May 7",  day: "Thursday"  },
    { id: "may8",  date: "May 8",  day: "Friday"    },
    { id: "may11", date: "May 11", day: "Monday"    },
    { id: "may12", date: "May 12", day: "Tuesday"   },
  ],
  rules: [
    // ── Named overrides ────────────────────────────────────────────────────
    { day: "may4",  period: 3,
      note: "Modern Languages 102, 103, 202, 203",
      match: { type: "courses", list: [
        { sub: "MLNG", nos: ["102","103","202","203"] },
        { sub: "FREN", nos: ["102","103","202","203"] },
        { sub: "GERM", nos: ["102","103","202","203"] },
        { sub: "SPAN", nos: ["102","103","202","203"] },
      ]}},
    { day: "may5",  period: 3,
      note: "BUAD 350 · CHEM 206",
      match: { type: "courses", list: [
        { sub: "BUAD", nos: ["350"] },
        { sub: "CHEM", nos: ["206"] },
      ]}},
    { day: "may6",  period: 3,
      note: "MATH 104, 106, 111, 112, 212, 351, 352, 451, 452",
      match: { type: "courses", list: [
        { sub: "MATH", nos: ["104","106","111","112","212","351","352","451","452"] },
      ]}},
    { day: "may7",  period: 3,
      note: "BUAD 323 · CSCI 141",
      match: { type: "courses", list: [
        { sub: "BUAD", nos: ["323"] },
        { sub: "CSCI", nos: ["141"] },
      ]}},
    { day: "may8",  period: 3,
      note: "BIOL 204, 310, 410 · BUAD 231",
      match: { type: "courses", list: [
        { sub: "BIOL", nos: ["204","310","410"] },
        { sub: "BUAD", nos: ["231"] },
      ]}},

    // ── Exact time + day pattern ───────────────────────────────────────────
    { day: "may4",  period: 1, note: "9:30 a.m. TR",
      match: { type: "exact", start: toMin(9, 30),  days: ["TR"] }},
    { day: "may4",  period: 2, note: "2:00 p.m. TR",
      match: { type: "exact", start: toMin(14, 0),  days: ["TR"] }},
    { day: "may5",  period: 1, note: "11:00 a.m. MWF",
      match: { type: "exact", start: toMin(11, 0),  days: ["MWF"] }},
    { day: "may5",  period: 2, note: "8:00 a.m. TR",
      match: { type: "exact", start: toMin(8,  0),  days: ["TR"] }},
    { day: "may6",  period: 1, note: "9:00 a.m. MWF",
      match: { type: "exact", start: toMin(9,  0),  days: ["MWF"] }},
    { day: "may6",  period: 2, note: "3:30 p.m. TR",
      match: { type: "exact", start: toMin(15,30),  days: ["TR"] }},
    { day: "may7",  period: 1, note: "3:30 p.m. MW / MF / MWF / WF",
      match: { type: "exact", start: toMin(15,30),  days: ["MW","MF","MWF","WF"] }},
    { day: "may7",  period: 2, note: "10:00 a.m. MWF",
      match: { type: "exact", start: toMin(10, 0),  days: ["MWF"] }},
    { day: "may8",  period: 1, note: "12:00 noon MWF",
      match: { type: "exact", start: toMin(12, 0),  days: ["MWF"] }},
    { day: "may8",  period: 2, note: "11:00 a.m. TR",
      match: { type: "exact", start: toMin(11, 0),  days: ["TR"] }},
    { day: "may11", period: 1, note: "8:00 a.m. MWF",
      match: { type: "exact", start: toMin(8,  0),  days: ["MWF"] }},
    { day: "may11", period: 2, note: "2:00 p.m. MW / MF / MWF / WF",
      match: { type: "exact", start: toMin(14, 0),  days: ["MW","MF","MWF","WF"] }},
    { day: "may12", period: 1, note: "12:30 p.m. TR",
      match: { type: "exact", start: toMin(12,30),  days: ["TR"] }},
    { day: "may12", period: 2, note: "1:00 p.m. MWF",
      match: { type: "exact", start: toMin(13, 0),  days: ["MWF"] }},

    // ── "Or later" catch-ups ──────────────────────────────────────────────
    { day: "may5",  period: 3, note: "5:00 p.m. or later — MW",
      match: { type: "gte", start: toMin(17, 0),  days: ["MW"] }},
    { day: "may7",  period: 3, note: "5:00 p.m. or later — TR",
      match: { type: "gte", start: toMin(17, 0),  days: ["TR"] }},
    { day: "may8",  period: 3, note: "2:00 p.m. or later — F only",
      match: { type: "gte", start: toMin(14, 0),  days: ["F"] }},
    { day: "may11", period: 3, note: "3:30 p.m. or later — single day (M / T / W / R)",
      match: { type: "gte", start: toMin(15,30),  days: ["M","T","W","R"] }},

    // ── No regular meeting time ───────────────────────────────────────────
    { day: "may12", period: 3, note: "No regular meeting days / times",
      match: { type: "noRegular" }},
  ],
};

// ─── FALL 2025 ────────────────────────────────────────────────────────────────
// Note: Due to a weather event, some Dec 8–9 in-person exams were rescheduled
// to Saturday, December 13. This schedule reflects the original published times.

export const FALL_2025 = {
  semester: "Fall 2025",
  periods: {
    1: { label: "1st Period", time: "9:00 AM – 12:00 PM" },
    2: { label: "2nd Period", time: "2:00 PM – 5:00 PM"  },
    3: { label: "3rd Period", time: "7:00 PM – 10:00 PM" },
  },
  weatherNote: "⚠ Some Dec 8–9 exams were rescheduled to Sat, Dec 13 due to weather. See registrar for details.",
  examDays: [
    { id: "dec8",  date: "December 8",  day: "Monday"    },
    { id: "dec9",  date: "December 9",  day: "Tuesday"   },
    { id: "dec10", date: "December 10", day: "Wednesday" },
    { id: "dec11", date: "December 11", day: "Thursday"  },
    { id: "dec12", date: "December 12", day: "Friday"    },
    { id: "dec15", date: "December 15", day: "Monday"    },
    { id: "dec16", date: "December 16", day: "Tuesday"   },
  ],
  rules: [
    // ── Named overrides ────────────────────────────────────────────────────
    { day: "dec8",  period: 3,
      note: "Modern Languages 101, 103, 201, 203",
      match: { type: "courses", list: [
        { sub: "MLNG", nos: ["101","103","201","203"] },
        { sub: "FREN", nos: ["101","103","201","203"] },
        { sub: "GERM", nos: ["101","103","201","203"] },
        { sub: "SPAN", nos: ["101","103","201","203"] },
      ]}},
    { day: "dec9",  period: 3,
      note: "BUAD 350 · CHEM 207",
      match: { type: "courses", list: [
        { sub: "BUAD", nos: ["350"] },
        { sub: "CHEM", nos: ["207"] },
      ]}},
    { day: "dec10", period: 3,
      note: "MATH 104, 106, 111, 112, 212, 351, 452",
      match: { type: "courses", list: [
        { sub: "MATH", nos: ["104","106","111","112","212","351","452"] },
      ]}},
    { day: "dec11", period: 3,
      note: "BUAD 323 · CSCI 141",
      match: { type: "courses", list: [
        { sub: "BUAD", nos: ["323"] },
        { sub: "CSCI", nos: ["141"] },
      ]}},
    { day: "dec12", period: 3,
      note: "BIOL 203, 310, 410 · BUAD 231",
      match: { type: "courses", list: [
        { sub: "BIOL", nos: ["203","310","410"] },
        { sub: "BUAD", nos: ["231"] },
      ]}},

    // ── Exact time + day pattern ───────────────────────────────────────────
    { day: "dec8",  period: 1, note: "3:30 p.m. MW / MF / MWF / WF",
      match: { type: "exact", start: toMin(15,30), days: ["MW","MF","MWF","WF"] }},
    { day: "dec8",  period: 2, note: "10:00 a.m. MWF",
      match: { type: "exact", start: toMin(10, 0), days: ["MWF"] }},
    { day: "dec9",  period: 1, note: "12:00 noon MWF",
      match: { type: "exact", start: toMin(12, 0), days: ["MWF"] }},
    { day: "dec9",  period: 2, note: "11:00 a.m. TR",
      match: { type: "exact", start: toMin(11, 0), days: ["TR"] }},
    { day: "dec10", period: 1, note: "8:00 a.m. MWF",
      match: { type: "exact", start: toMin(8,  0), days: ["MWF"] }},
    { day: "dec10", period: 2, note: "2:00 p.m. MW / MF / MWF / WF",
      match: { type: "exact", start: toMin(14, 0), days: ["MW","MF","MWF","WF"] }},
    { day: "dec11", period: 1, note: "12:30 p.m. TR",
      match: { type: "exact", start: toMin(12,30), days: ["TR"] }},
    { day: "dec11", period: 2, note: "1:00 p.m. MWF",
      match: { type: "exact", start: toMin(13, 0), days: ["MWF"] }},
    { day: "dec12", period: 1, note: "9:30 a.m. TR",
      match: { type: "exact", start: toMin(9, 30), days: ["TR"] }},
    { day: "dec12", period: 2, note: "2:00 p.m. TR",
      match: { type: "exact", start: toMin(14, 0), days: ["TR"] }},
    { day: "dec15", period: 1, note: "11:00 a.m. MWF",
      match: { type: "exact", start: toMin(11, 0), days: ["MWF"] }},
    { day: "dec15", period: 2, note: "8:00 a.m. TR",
      match: { type: "exact", start: toMin(8,  0), days: ["TR"] }},
    { day: "dec16", period: 1, note: "9:00 a.m. MWF",
      match: { type: "exact", start: toMin(9,  0), days: ["MWF"] }},
    { day: "dec16", period: 2, note: "3:30 p.m. TR",
      match: { type: "exact", start: toMin(15,30), days: ["TR"] }},

    // ── "Or later" catch-ups ──────────────────────────────────────────────
    { day: "dec11", period: 3, note: "5:00 p.m. or later — MW or TR",
      match: { type: "gte", start: toMin(17, 0),  days: ["MW","TR"] }},
    { day: "dec12", period: 3, note: "2:00 p.m. or later — F only",
      match: { type: "gte", start: toMin(14, 0),  days: ["F"] }},
    { day: "dec15", period: 3, note: "3:30 p.m. or later — single day (M / T / W / R)",
      match: { type: "gte", start: toMin(15,30),  days: ["M","T","W","R"] }},

    // ── No regular meeting time ───────────────────────────────────────────
    { day: "dec16", period: 3, note: "No regular meeting days / times",
      match: { type: "noRegular" }},
  ],
};

// ─── SPRING 2025 ──────────────────────────────────────────────────────────────

export const SPRING_2025 = {
  semester: "Spring 2025",
  periods: {
    1: { label: "1st Period", time: "9:00 AM – 12:00 PM" },
    2: { label: "2nd Period", time: "2:00 PM – 5:00 PM"  },
    3: { label: "3rd Period", time: "7:00 PM – 10:00 PM" },
  },
  examDays: [
    { id: "may5",  date: "May 5",  day: "Monday"    },
    { id: "may6",  date: "May 6",  day: "Tuesday"   },
    { id: "may7",  date: "May 7",  day: "Wednesday" },
    { id: "may8",  date: "May 8",  day: "Thursday"  },
    { id: "may9",  date: "May 9",  day: "Friday"    },
    { id: "may12", date: "May 12", day: "Monday"    },
    { id: "may13", date: "May 13", day: "Tuesday"   },
  ],
  rules: [
    // ── Named overrides ────────────────────────────────────────────────────
    { day: "may5",  period: 3,
      note: "Modern Languages 102, 103, 202, 203",
      match: { type: "courses", list: [
        { sub: "MLNG", nos: ["102","103","202","203"] },
        { sub: "FREN", nos: ["102","103","202","203"] },
        { sub: "GERM", nos: ["102","103","202","203"] },
        { sub: "SPAN", nos: ["102","103","202","203"] },
      ]}},
    { day: "may6",  period: 3,
      note: "BUAD 350 · CHEM 206",
      match: { type: "courses", list: [
        { sub: "BUAD", nos: ["350"] },
        { sub: "CHEM", nos: ["206"] },
      ]}},
    { day: "may7",  period: 3,
      note: "MATH 104, 111, 112, 212, 451, 452",
      match: { type: "courses", list: [
        { sub: "MATH", nos: ["104","111","112","212","451","452"] },
      ]}},
    { day: "may8",  period: 3,
      note: "BUAD 323 · CSCI 141",
      match: { type: "courses", list: [
        { sub: "BUAD", nos: ["323"] },
        { sub: "CSCI", nos: ["141"] },
      ]}},
    { day: "may9",  period: 3,
      note: "BIOL 204, 310, 410 · BUAD 231",
      match: { type: "courses", list: [
        { sub: "BIOL", nos: ["204","310","410"] },
        { sub: "BUAD", nos: ["231"] },
      ]}},

    // ── Exact time + day pattern ───────────────────────────────────────────
    { day: "may5",  period: 1, note: "12:30 p.m. TR",
      match: { type: "exact", start: toMin(12,30), days: ["TR"] }},
    { day: "may5",  period: 2, note: "1:00 p.m. MWF",
      match: { type: "exact", start: toMin(13, 0), days: ["MWF"] }},
    { day: "may6",  period: 1, note: "9:30 a.m. TR",
      match: { type: "exact", start: toMin(9, 30), days: ["TR"] }},
    { day: "may6",  period: 2, note: "2:00 p.m. TR",
      match: { type: "exact", start: toMin(14, 0), days: ["TR"] }},
    { day: "may7",  period: 1, note: "11:00 a.m. MWF",
      match: { type: "exact", start: toMin(11, 0), days: ["MWF"] }},
    { day: "may7",  period: 2, note: "8:00 a.m. TR",
      match: { type: "exact", start: toMin(8,  0), days: ["TR"] }},
    { day: "may8",  period: 1, note: "9:00 a.m. MWF",
      match: { type: "exact", start: toMin(9,  0), days: ["MWF"] }},
    { day: "may8",  period: 2, note: "3:30 p.m. TR",
      match: { type: "exact", start: toMin(15,30), days: ["TR"] }},
    { day: "may9",  period: 1, note: "3:30 p.m. MW / MF / MWF / WF",
      match: { type: "exact", start: toMin(15,30), days: ["MW","MF","MWF","WF"] }},
    { day: "may9",  period: 2, note: "10:00 a.m. MWF",
      match: { type: "exact", start: toMin(10, 0), days: ["MWF"] }},
    { day: "may12", period: 1, note: "12:00 noon MWF",
      match: { type: "exact", start: toMin(12, 0), days: ["MWF"] }},
    { day: "may12", period: 2, note: "11:00 a.m. TR",
      match: { type: "exact", start: toMin(11, 0), days: ["TR"] }},
    { day: "may13", period: 1, note: "8:00 a.m. MWF",
      match: { type: "exact", start: toMin(8,  0), days: ["MWF"] }},
    { day: "may13", period: 2, note: "2:00 p.m. MW / MF / MWF / WF",
      match: { type: "exact", start: toMin(14, 0), days: ["MW","MF","MWF","WF"] }},

    // ── "Or later" catch-ups ──────────────────────────────────────────────
    { day: "may6",  period: 3, note: "5:00 p.m. or later — MW",
      match: { type: "gte", start: toMin(17, 0),  days: ["MW"] }},
    { day: "may8",  period: 3, note: "5:00 p.m. or later — TR",
      match: { type: "gte", start: toMin(17, 0),  days: ["TR"] }},
    { day: "may9",  period: 3, note: "2:00 p.m. or later — F only",
      match: { type: "gte", start: toMin(14, 0),  days: ["F"] }},
    { day: "may12", period: 3, note: "3:30 p.m. or later — single day (M / T / W / R)",
      match: { type: "gte", start: toMin(15,30),  days: ["M","T","W","R"] }},

    // ── No regular meeting time ───────────────────────────────────────────
    { day: "may13", period: 3, note: "No regular meeting days / times",
      match: { type: "noRegular" }},
  ],
};

// ─── REGISTRY ─────────────────────────────────────────────────────────────────
// Most recent first so the dropdown defaults to the current semester

export const EXAM_SCHEDULES = {
  "Fall 2026":   FALL_2026,
  "Spring 2026": SPRING_2026,
  "Fall 2025":   FALL_2025,
  "Spring 2025": SPRING_2025,
};
