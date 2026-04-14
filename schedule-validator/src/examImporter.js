// ─── PROMPT ──────────────────────────────────────────────────────────────────
// Admins copy this, go to gemini.google.com, paste it + the exam schedule, then
// paste Gemini's JSON response back into the app.

export const GEMINI_PROMPT = `Convert the following W&M exam schedule into JSON using exactly this format:

{
  "semester": "SEMESTER NAME (e.g. Fall 2027)",
  "slots": [
    {
      "date": "DATE (e.g. December 8)",
      "day": "DAY NAME (e.g. Monday)",
      "period": PERIOD NUMBER (1, 2, or 3),
      "rule": "RULE STRING (see formats below)"
    }
  ]
}

RULE STRING formats — use exactly these patterns:
- Exact time + days:           "12:00 PM MWF"  or  "9:30 AM TR"
- Multiple day patterns:       "2:00 PM MW or MF or MWF or WF"
- Time or later + days:        "5:00 PM or later MW"  or  "5:00 PM or later TR"
- Single day only (or later):  "3:30 PM or later M only or T only or W only or R only"
- Friday only (or later):      "2:00 PM or later F only"
- Named course overrides:      "courses: BUAD 350, CHEM 207"
- No regular meeting time:     "no regular meeting"

Important rules:
- Skip reading days entirely — do not include them
- Include all 3 periods for every exam day
- If a period cell lists BOTH a time rule AND named course overrides, create TWO separate slot entries for that same date and period
- For named courses use the format: SUBJECT SPACE NUMBER (e.g. BUAD 350, not "Business Administration 350")
- Output ONLY the JSON — no explanation, no markdown fences

EXAM SCHEDULE TO CONVERT:
`;


// ─── PARSER ──────────────────────────────────────────────────────────────────

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

function parseRuleStr(rule) {
  const r = rule.trim();

  if (/no regular meeting/i.test(r)) {
    return { type: 'noRegular' };
  }

  if (/^courses:/i.test(r)) {
    const part = r.replace(/^courses:\s*/i, '');
    const grouped = {};
    part.split(',').map(s => s.trim()).filter(Boolean).forEach(entry => {
      const m = entry.match(/^([A-Za-z]+)\s+(\S+)/);
      if (m) {
        const sub = m[1].toUpperCase();
        const no  = m[2];
        if (!grouped[sub]) grouped[sub] = { sub, nos: [] };
        grouped[sub].nos.push(no);
      }
    });
    const list = Object.values(grouped);
    if (list.length === 0) return null;
    return { type: 'courses', list };
  }

  const startMin = parseTimeStr(r);
  if (startMin === null) return null;

  const isGte = /or later/i.test(r);

  const rest = r
    .replace(/\d{1,2}:\d{2}\s*(?:AM|PM)/i, '')
    .replace(/or later/i, '')
    .trim();

  const dayParts = rest
    .split(/\s+or\s+/i)
    .map(d => d.replace(/\s*only\s*/i, '').replace(/\s/g, '').toUpperCase())
    .filter(d => /^[MTWRF]+$/.test(d));

  if (dayParts.length === 0) return null;

  return { type: isGte ? 'gte' : 'exact', start: startMin, days: dayParts };
}

/**
 * Convert Gemini's simple JSON into the internal schedule format used by examLogic.js.
 */
export function jsonToSchedule(json) {
  if (!json.semester || !Array.isArray(json.slots)) {
    throw new Error('JSON must have "semester" and "slots" fields.');
  }

  const dayMap = new Map();
  json.slots.forEach(s => {
    if (!dayMap.has(s.date)) {
      const id = s.date.toLowerCase().replace(/[^a-z0-9]/g, '');
      dayMap.set(s.date, { id, date: s.date, day: s.day });
    }
  });

  const courseRules = [], timeRules = [], noRegRules = [];

  json.slots.forEach(s => {
    const dayEntry = dayMap.get(s.date);
    if (!dayEntry) return;
    const match = parseRuleStr(s.rule);
    if (!match) return;
    const rule = { day: dayEntry.id, period: Number(s.period), note: s.rule, match };
    if (match.type === 'courses')         courseRules.push(rule);
    else if (match.type === 'noRegular')  noRegRules.push(rule);
    else                                  timeRules.push(rule);
  });

  return {
    semester: json.semester,
    periods: {
      1: { label: '1st Period', time: '9:00 AM – 12:00 PM' },
      2: { label: '2nd Period', time: '2:00 PM – 5:00 PM'  },
      3: { label: '3rd Period', time: '7:00 PM – 10:00 PM' },
    },
    examDays: [...dayMap.values()],
    rules: [...courseRules, ...timeRules, ...noRegRules],
  };
}


// ─── LOCAL STORAGE ────────────────────────────────────────────────────────────

const LS_KEY = 'wm_custom_exam_schedules';

export function saveCustomSchedule(schedule) {
  const existing = loadCustomSchedules();
  const filtered = existing.filter(s => s.semester !== schedule.semester);
  filtered.push(schedule);
  localStorage.setItem(LS_KEY, JSON.stringify(filtered));
}

export function loadCustomSchedules() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function deleteCustomSchedule(semesterName) {
  const filtered = loadCustomSchedules().filter(s => s.semester !== semesterName);
  localStorage.setItem(LS_KEY, JSON.stringify(filtered));
}
