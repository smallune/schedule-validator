import os
import json
import google.generativeai as genai


def generate_schedule(courses, rooms, time_slots, constraints, confirmed, proposed):
    """
    Call Gemini to generate / review a course schedule.

    Parameters
    ----------
    courses    : list[dict] – all active courses
    rooms      : list[dict] – all active rooms
    time_slots : list[dict] – all time slots
    constraints: list[dict] – all active constraints
    confirmed  : list[dict] – entries with status='confirmed' (locked)
    proposed   : list[dict] – entries with status='proposed'  (current draft)

    Returns
    -------
    list[dict] with keys: course_id, room_id, slot_id, reasoning
    """
    genai.configure(api_key=os.environ.get('GOOGLE_API_KEY'))

    model = genai.GenerativeModel(
        model_name='gemini-2.0-flash',
        generation_config=genai.GenerationConfig(
            temperature=0.1,
            max_output_tokens=32000,
        )
    )

    # ── Build prompt sections ─────────────────────────────────────────────────

    rooms_lines = '\n'.join(
        f'  room_id={r["id"]}, name="{r["name"]}", capacity={r["capacity"]}, type={r["room_type"]}'
        for r in rooms
    )

    def _fmt_slots(day):
        s = [ts for ts in time_slots if ts['days'] == day]
        return '\n'.join(
            f'  slot_id={ts["id"]}, "{ts["label"]}" ({ts["start_time"]}–{ts["end_time"]})'
            for ts in s
        ) or '  (none)'

    slots_section = (
        f'Monday/Wednesday (MW):\n{_fmt_slots("MW")}\n\n'
        f'Tuesday/Thursday (TR):\n{_fmt_slots("TR")}\n\n'
        f'Mon/Wed/Fri (MWF):\n{_fmt_slots("MWF")}\n\n'
        f'Friday Only (F):\n{_fmt_slots("F")}'
    )

    courses_lines = '\n'.join(
        f'  course_id={c["id"]}, CRN={c["crn"]}, '
        f'code=BUAD {c["course_no"]}-{c["section"]}, '
        f'title="{c["title"]}", '
        f'enrollment={c["adj_enrollment"]}, '
        f'type={c["course_type"]}, '
        f'credits={c["credits"]}, '
        f'instructor={c["instructor_last"] or "TBD"}'
        for c in courses
    )

    confirmed_lines = '\n'.join(
        f'  course_id={e["course_id"]} (BUAD {e["course_no"]}-{e["section"]}) '
        f'→ room_id={e["room_id"]} ("{e["room_name"]}") '
        f'at slot_id={e["slot_id"]} ("{e["slot_label"]}") [LOCKED]'
        for e in confirmed
    ) or '  (none confirmed yet)'

    proposed_lines = '\n'.join(
        f'  course_id={e["course_id"]} (BUAD {e["course_no"]}-{e["section"]}) '
        f'→ room_id={e["room_id"]} ("{e["room_name"]}") '
        f'at slot_id={e["slot_id"]} ("{e["slot_label"]}")'
        for e in proposed
    ) or '  (no proposed entries yet – assign all courses)'

    constraints_lines = '\n'.join(
        f'  [{c["category"].upper()}] {c["description"]}'
        for c in constraints
    ) or '  (no constraints entered yet)'

    prompt = f"""You are a university scheduling assistant for William & Mary's Mason School of Business.
Generate a complete, conflict-free Fall 2026 undergraduate course schedule.

═══ AVAILABLE ROOMS ({len(rooms)} total) ═══
{rooms_lines}

═══ AVAILABLE TIME SLOTS ═══
{slots_section}

═══ COURSES TO SCHEDULE ({len(courses)} total) ═══
{courses_lines}

═══ CONFIRMED ASSIGNMENTS – DO NOT CHANGE ═══
{confirmed_lines}

═══ CURRENT PROPOSED ASSIGNMENTS (review & improve) ═══
{proposed_lines}

═══ CONSTRAINTS & PREFERENCES ═══
{constraints_lines}

═══ SCHEDULING RULES ═══
1. ROOM CONFLICTS: Each room may have at most ONE course per time slot.
2. INSTRUCTOR CONFLICTS: An instructor cannot teach two courses at the same time.
3. CAPACITY: room capacity must be >= course enrollment.
4. LOCKED ENTRIES: Never reassign a confirmed course.
5. HONOR CONSTRAINTS: Respect every professor/course constraint listed above.
6. PRIORITY ORDER: Core > Required > Elective > Prerequisite.
   Schedule Core and Required courses in prime time (9 am–3 pm) first.
7. LAB SECTIONS: 1-credit Friday lab sections (e.g., BUAD 231L) must use Friday-only slots.
8. MWF vs MW/TR: BUAD 200 meets MWF; use MWF slots for it.
9. UNSCHEDULED: If a course truly cannot be placed (no valid room/slot), use room_id=null and slot_id=null with a clear explanation in "reasoning".

═══ YOUR TASK ═══
1. Review proposed assignments; detect and fix all conflicts.
2. Assign any currently unscheduled courses.
3. Return the COMPLETE list of assignments for ALL {len(courses)} courses.

═══ OUTPUT FORMAT ═══
Return ONLY a raw JSON array – no markdown fences, no extra text:
[
  {{
    "course_id": <integer>,
    "room_id": <integer or null>,
    "slot_id": <integer or null>,
    "reasoning": "<brief note if you changed something; empty string otherwise>"
  }},
  ...
]
"""

    response = model.generate_content(prompt)
    text = response.text

    # Extract JSON array from response
    start = text.find('[')
    end   = text.rfind(']') + 1
    if start == -1 or end <= start:
        raise ValueError(f'Gemini did not return a JSON array.\n\nRaw response:\n{text[:800]}')

    try:
        return json.loads(text[start:end])
    except json.JSONDecodeError as exc:
        raise ValueError(f'JSON parse error: {exc}\n\nRaw fragment:\n{text[start:start+400]}')
