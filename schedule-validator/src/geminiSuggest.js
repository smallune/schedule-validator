// ─── GEMINI SUGGEST FIX ───────────────────────────────────────────────────────
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
const API_KEY_LS = 'wm_gemini_suggest_key';

export function saveSuggestApiKey(key) { localStorage.setItem(API_KEY_LS, key); }
export function loadSuggestApiKey() { return localStorage.getItem(API_KEY_LS) || ''; }

function fmt(min) {
  if (min == null) return '?';
  const h = Math.floor(min / 60), m = min % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// ─── SHARED CONTEXT BUILDER ───────────────────────────────────────────────────
// Used by both buildSuggestPrompt (browser) and getGeminiSuggestions (API)
function buildContext(course, allCourses, problemType) {
  // room -> array of "days HH:MM–HH:MM" strings for every slot it's booked
  const roomSchedule = {};
  allCourses.forEach(c => {
    if (!c.room || c.room === 'TBA' || c.room === '-' || c.start == null) return;
    if (!roomSchedule[c.room]) roomSchedule[c.room] = [];
    roomSchedule[c.room].push(`${c.days} ${fmt(c.start)}–${fmt(c.end)}`);
  });

  const courseSlot = `${course.days}|${course.start}-${course.end}`;
  const allRooms = [...new Set(allCourses.map(c => c.room).filter(r => r && r !== 'TBA' && r !== '-'))].sort();

  // Rooms free RIGHT NOW at the problem timeslot with enough capacity
  const freeAndBig = [];
  allRooms.forEach(room => {
    const slots = roomSchedule[room] || [];
    const busyKeys = allCourses
      .filter(c => c.room === room && c.start != null)
      .map(c => `${c.days}|${c.start}-${c.end}`);
    if (busyKeys.includes(courseSlot)) return;
    const caps = allCourses.filter(c => c.room === room && c.capacity > 0).map(c => c.capacity);
    const maxCap = caps.length ? Math.max(...caps) : 0;
    if (maxCap >= course.enrolled) freeAndBig.push(`${room} (cap ~${maxCap})`);
  });

  // Full occupancy list for each room (so Gemini knows what's busy when suggesting new times)
  const roomOccupancyLines = allRooms
    .filter(r => roomSchedule[r]?.length)
    .map(r => {
      const caps = allCourses.filter(c => c.room === r && c.capacity > 0).map(c => c.capacity);
      const maxCap = caps.length ? Math.max(...caps) : '?';
      const slots = [...new Set(roomSchedule[r])].sort().join(', ');
      return `  ${r} (cap ~${maxCap}): ${slots}`;
    });

  const sameDay = allCourses.filter(c => c.days === course.days && c.start != null);
  const usedTimes = [...new Set(sameDay.map(c => `${fmt(c.start)}–${fmt(c.end)}`))].sort().join(', ');

  const problemDesc = problemType === 'over'
    ? `OVER CAPACITY: ${course.subject} ${course.courseNo} has ${course.enrolled} students enrolled but room ${course.room} only holds ${course.capacity}.`
    : `DOUBLE BOOKED: ${course.subject} ${course.courseNo} shares room ${course.room} with another course at the same time.`;

  return { problemDesc, freeAndBig, usedTimes, roomOccupancyLines };
}

function buildPromptText(course, problemDesc, freeAndBig, usedTimes, roomOccupancyLines) {
  return `You are helping a university schedule administrator fix a course scheduling conflict at William & Mary's Mason School of Business.

PROBLEM: ${problemDesc}

COURSE: ${course.subject} ${course.courseNo} Section ${course.section || '01'}
Instructor: ${course.instructor || 'TBD'}
Currently meets: ${course.days} ${fmt(course.start)}–${fmt(course.end)} in room ${course.room} (cap ${course.capacity}, enrolled ${course.enrolled})

ROOMS FREE AT THE CURRENT TIMESLOT (${course.days} ${fmt(course.start)}) WITH ENOUGH CAPACITY:
${freeAndBig.length > 0 ? freeAndBig.slice(0, 10).join('\n') : 'None — no larger room is free at this exact time'}

TIMES ALREADY IN USE ON ${course.days} (do not suggest these for a new section):
${usedTimes || 'Unknown'}

FULL ROOM OCCUPANCY SCHEDULE (use this to avoid double-booking when suggesting a new time):
${roomOccupancyLines.slice(0, 20).join('\n') || 'No data'}

IMPORTANT: When suggesting a new section at a different time, check the room occupancy schedule above and make sure the room is NOT already listed as busy at that day/time. Never suggest a timeslot that appears in the "already in use" list.

Give 2–3 specific, actionable suggestions in plain English. For each suggestion, clearly state:
- What type of fix it is (Move to a different room OR Add a new section)
- The exact room name
- The days and time (if adding a section)
- Why it solves the problem`;
}

/**
 * Build a plain-English prompt the admin can paste into gemini.google.com.
 * No API key needed.
 */
export function buildSuggestPrompt(course, allCourses, problemType) {
  const { problemDesc, freeAndBig, usedTimes, roomOccupancyLines } = buildContext(course, allCourses, problemType);
  return buildPromptText(course, problemDesc, freeAndBig, usedTimes, roomOccupancyLines);
}

export async function getGeminiSuggestions(apiKey, course, allCourses, problemType) {
  const { problemDesc, freeAndBig, usedTimes, roomOccupancyLines } = buildContext(course, allCourses, problemType);

  const prompt = buildPromptText(course, problemDesc, freeAndBig, usedTimes, roomOccupancyLines)
    .replace(
      'Give 2–3 specific, actionable suggestions in plain English. For each suggestion, clearly state:\n- What type of fix it is (Move to a different room OR Add a new section)\n- The exact room name (from the free rooms list above)\n- The days and time (if adding a section)\n- Why it solves the problem',
      `Give 2–3 specific, actionable suggestions. Return ONLY a JSON array, no markdown, no explanation:
[
  {
    "type": "change_room",
    "description": "Short human-readable explanation",
    "room": "Exact room name from the free rooms list above",
    "capacity": number
  },
  {
    "type": "add_section",
    "description": "Short human-readable explanation",
    "days": "TR",
    "startTime": "2:00 PM",
    "endTime": "3:15 PM",
    "room": "Room name",
    "capacity": number
  }
]

Rules:
- Only suggest rooms that appear in the free rooms list above
- If no rooms are free, suggest 2 add_section options at different times not in the used times list
- Standard class durations: 75 min (9:30-10:45, 11:00-12:15, 12:30-1:45, 2:00-3:15, 3:30-4:45) or 50 min (8:00-8:50, 9:00-9:50, 10:00-10:50, 11:00-11:50, 12:00-12:50, 1:00-1:50, 2:00-2:50, 3:00-3:50)`
    );

  const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const clean = text.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/i, '').trim();

  try {
    return JSON.parse(clean);
  } catch {
    throw new Error('Gemini returned invalid JSON. Please try again.');
  }
}
