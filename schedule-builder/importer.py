import pandas as pd
import re
from database import get_db

# Known room info derived from the Room Grid and enrollment files
KNOWN_ROOM_INFO = {
    'MILLER 1069': {'capacity': 48,  'room_type': 'Flat',            'building': 'Miller'},
    'MILLER 1077': {'capacity': 45,  'room_type': 'Cluster',         'building': 'Miller'},
    'MILLER 1078': {'capacity': 45,  'room_type': 'Cluster',         'building': 'Miller'},
    'MILLER 1082': {'capacity': 60,  'room_type': 'Tiered',          'building': 'Miller'},
    'MILLER 1088': {'capacity': 60,  'room_type': 'Tiered',          'building': 'Miller'},
    'MILLER 1090': {'capacity': 45,  'room_type': 'Standard',        'building': 'Miller'},
    'MILLER 2052': {'capacity': 60,  'room_type': 'Standard',        'building': 'Miller'},
    'MILLER 1066': {'capacity': 24,  'room_type': 'Seminar',         'building': 'Miller'},
    'MILLER 1005': {'capacity': 30,  'room_type': 'Standard',        'building': 'Miller'},
    'MILLER 1008': {'capacity': 32,  'room_type': 'Design Lab',      'building': 'Miller'},
    'MILLER 1013': {'capacity': 24,  'room_type': 'Seminar',         'building': 'Miller'},
    'MILLER 1018': {'capacity': 24,  'room_type': 'Seminar',         'building': 'Miller'},
    'MILLER 1019': {'capacity': 46,  'room_type': 'Finance Markets', 'building': 'Miller'},
    'MILLER 2003': {'capacity': 30,  'room_type': 'Standard',        'building': 'Miller'},
    'MILLER 1027': {'capacity': 45,  'room_type': 'Standard',        'building': 'Miller'},
    'ISC 1127':    {'capacity': 180, 'room_type': 'Large Lecture',   'building': 'ISC'},
}


def _clean(val):
    if val is None:
        return ''
    s = str(val).strip()
    return '' if s.lower() in ('nan', '-null-', 'null', 'none', '-') else s


def _parse_days(raw):
    """'M  W' -> 'MW', 'T  R' -> 'TR', 'M  W  F' -> 'MWF'"""
    if not raw:
        return ''
    return ''.join(raw.split())


def _match_slot(timeslot_str, days_str, db):
    """Map 'HHMM-HHMM DAYS' string to a time_slots row id."""
    if not timeslot_str or not days_str:
        return None
    m = re.match(r'(\d{4})-(\d{4})', timeslot_str)
    if not m:
        return None
    start = f'{m.group(1)[:2]}:{m.group(1)[2:]}'
    end   = f'{m.group(2)[:2]}:{m.group(2)[2:]}'
    row = db.execute(
        'SELECT id FROM time_slots WHERE days=? AND start_time=? AND end_time=?',
        (days_str, start, end)
    ).fetchone()
    return row['id'] if row else None


def _ensure_room(room_name, fallback_cap, db):
    """Return room id, creating the row if it doesn't exist."""
    if not room_name:
        return None
    existing = db.execute('SELECT id FROM rooms WHERE name=?', (room_name,)).fetchone()
    if existing:
        return existing['id']
    info = KNOWN_ROOM_INFO.get(room_name.upper(), {})
    cap      = info.get('capacity', fallback_cap or 30)
    rtype    = info.get('room_type', 'Standard')
    building = info.get('building', 'ISC' if room_name.upper().startswith('ISC') else 'Miller')
    db.execute(
        'INSERT INTO rooms (name, capacity, room_type, building) VALUES (?,?,?,?)',
        (room_name, cap, rtype, building)
    )
    return db.execute('SELECT last_insert_rowid()').fetchone()[0]


def import_courses(filepath):
    """
    Import courses from the UG Enrollment & Schedule Excel file.
    Also creates initial 'proposed' schedule entries for courses that
    already have room/time assignments.
    Returns (courses_added, entries_created).
    """
    df = pd.read_excel(filepath)
    db = get_db()
    courses_added = 0
    entries_created = 0

    for _, row in df.iterrows():
        crn = _clean(row.get('CRN'))
        if not crn:
            continue

        area       = _clean(row.get('Area'))
        course_no  = _clean(row.get('Course No'))
        section    = _clean(row.get('Section No'))
        title      = _clean(row.get('Title'))
        max_enrl   = int(row['Max'])       if pd.notna(row.get('Max'))       else 0
        adj_enrl   = int(row['Adj. Enrl']) if pd.notna(row.get('Adj. Enrl')) else 0
        room_cap_v = int(row['Room Cap'])  if pd.notna(row.get('Room Cap'))  else 0
        ctype      = _clean(row.get('Crse Type')) or 'Elective'
        credits_v  = int(row['Cred'])      if pd.notna(row.get('Cred'))      else 3
        days       = _parse_days(_clean(row.get('Days 1')))
        timeslot   = _clean(row.get('Timeslot 1'))
        room_name  = _clean(row.get('Room'))
        instr_last = _clean(row.get('Instr Last'))
        instr_first= _clean(row.get('Instr First'))

        existing = db.execute('SELECT id FROM courses WHERE crn=?', (crn,)).fetchone()
        if existing:
            course_id = existing['id']
        else:
            db.execute('''
                INSERT INTO courses
                    (crn, area, course_no, section, title, max_enrollment, adj_enrollment,
                     room_cap, course_type, credits, current_days, current_timeslot,
                     current_room, instructor_last, instructor_first)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ''', (crn, area, course_no, section, title, max_enrl, adj_enrl, room_cap_v,
                  ctype, credits_v, days, timeslot, room_name, instr_last, instr_first))
            course_id = db.execute('SELECT last_insert_rowid()').fetchone()[0]
            courses_added += 1

        # Create initial proposed entry if room + days + timeslot are known
        if room_name and days and timeslot:
            room_id = _ensure_room(room_name, room_cap_v, db)
            slot_id = _match_slot(timeslot, days, db)
            if room_id and slot_id:
                has_entry = db.execute(
                    'SELECT id FROM schedule_entries WHERE course_id=?', (course_id,)
                ).fetchone()
                if not has_entry:
                    db.execute('''
                        INSERT INTO schedule_entries (course_id, room_id, slot_id, status, notes)
                        VALUES (?,?,?,'proposed','Imported from existing schedule data')
                    ''', (course_id, room_id, slot_id))
                    entries_created += 1

    db.commit()
    db.close()
    return courses_added, entries_created


def import_rooms_from_grid(filepath):
    """
    Import/update room capacities from the Room Grid Excel file.
    Reads header rows to extract room number and capacity info.
    Returns count of rooms upserted.
    """
    try:
        df = pd.read_excel(filepath, sheet_name='Grid', header=None)
    except Exception:
        return 0

    db = get_db()
    count = 0

    # Row index 5 = room numbers, row index 6 = capacity descriptions
    room_row = df.iloc[5] if len(df) > 5 else None
    cap_row  = df.iloc[6] if len(df) > 6 else None
    if room_row is None:
        db.close()
        return 0

    for col_idx in range(1, len(room_row)):
        room_val = _clean(room_row.iloc[col_idx])
        cap_val  = _clean(cap_row.iloc[col_idx]) if cap_row is not None else ''
        if not room_val or not room_val.isdigit():
            continue

        full_name = f'Miller {room_val}'
        # Parse capacity from e.g. "48/50 Flat" or "60 Tiered"
        cap_match = re.search(r'(\d+)', cap_val)
        capacity  = int(cap_match.group(1)) if cap_match else 0
        room_type = 'Standard'
        for keyword, rtype in [('Flat','Flat'),('Cluster','Cluster'),
                                ('Tiered','Tiered'),('Seminar','Seminar'),
                                ('Design','Design Lab'),('Fin','Finance Markets')]:
            if keyword.lower() in cap_val.lower():
                room_type = rtype
                break

        existing = db.execute('SELECT id FROM rooms WHERE name=?', (full_name,)).fetchone()
        if existing:
            if capacity:
                db.execute(
                    'UPDATE rooms SET capacity=?, room_type=? WHERE name=?',
                    (capacity, room_type, full_name)
                )
        else:
            db.execute(
                'INSERT INTO rooms (name, capacity, room_type, building) VALUES (?,?,?,?)',
                (full_name, capacity, room_type, 'Miller')
            )
            count += 1

    db.commit()
    db.close()
    return count
