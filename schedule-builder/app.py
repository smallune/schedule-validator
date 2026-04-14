import os
from collections import defaultdict
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from dotenv import load_dotenv

load_dotenv()

from database import init_db, get_db
from importer import import_courses, import_rooms_from_grid
from scheduler import generate_schedule

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-prod')


# ── Env-file helper ───────────────────────────────────────────────────────────

def _save_env_key(key, value):
    """Write/update a single KEY=value line in .env and apply it to os.environ."""
    env_path = os.path.join(BASE_DIR, '.env')
    lines = []
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            lines = f.readlines()
    found, new_lines = False, []
    for line in lines:
        if line.startswith(f'{key}='):
            new_lines.append(f'{key}={value}\n')
            found = True
        else:
            new_lines.append(line)
    if not found:
        new_lines.append(f'{key}={value}\n')
    with open(env_path, 'w') as f:
        f.writelines(new_lines)
    os.environ[key] = value


# ── Context processor – available in every template ───────────────────────────

@app.context_processor
def inject_globals():
    key = os.environ.get('GOOGLE_API_KEY', '')
    return {'has_api_key': bool(key)}

BASE_DIR = os.path.dirname(__file__)
ENROLLMENT_FILE = os.path.join(BASE_DIR, 'UG Fall 2026 Enrollment and Schedule as of 2.18.26.xlsx')
ROOM_GRID_FILE  = os.path.join(BASE_DIR, 'Fall 2026 - Room Grid.xlsx')


@app.before_request
def setup():
    init_db()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _schedule_grid():
    """Return (entries, rooms, slots_by_day, grid) for schedule view."""
    db = get_db()

    entries = [dict(r) for r in db.execute('''
        SELECT se.id, se.status, se.notes,
               c.id as course_id, c.course_no, c.section, c.title,
               c.adj_enrollment, c.crn, c.instructor_last, c.course_type,
               r.id as room_id, r.name as room_name, r.capacity as room_capacity,
               ts.id as slot_id, ts.label as slot_label,
               ts.days, ts.start_time, ts.end_time
        FROM schedule_entries se
        JOIN courses c  ON se.course_id = c.id
        JOIN rooms r    ON se.room_id   = r.id
        JOIN time_slots ts ON se.slot_id = ts.id
        WHERE se.status != 'rejected'
        ORDER BY ts.days, ts.start_time, r.name
    ''').fetchall()]

    rooms = [dict(r) for r in db.execute(
        'SELECT * FROM rooms WHERE active=1 ORDER BY building, name'
    ).fetchall()]

    all_slots = [dict(r) for r in db.execute(
        'SELECT * FROM time_slots ORDER BY days, start_time'
    ).fetchall()]
    slots_by_day = defaultdict(list)
    for s in all_slots:
        slots_by_day[s['days']].append(s)

    # grid[days][slot_id][room_id] = list of entries (>1 means conflict)
    grid = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    for e in entries:
        grid[e['days']][e['slot_id']][e['room_id']].append(e)

    # Detect instructor conflicts: same instructor, overlapping slot, different rooms
    instructor_conflicts = set()
    from itertools import combinations
    by_slot = defaultdict(list)
    for e in entries:
        by_slot[e['slot_id']].append(e)
    for slot_entries in by_slot.values():
        for a, b in combinations(slot_entries, 2):
            if (a['instructor_last'] and a['instructor_last'] == b['instructor_last']
                    and a['room_id'] != b['room_id']):
                instructor_conflicts.add(a['id'])
                instructor_conflicts.add(b['id'])

    db.close()
    return entries, rooms, dict(slots_by_day), grid, instructor_conflicts


# ── Dashboard ─────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    db = get_db()
    stats = {
        'courses':     db.execute('SELECT COUNT(*) FROM courses WHERE active=1').fetchone()[0],
        'rooms':       db.execute('SELECT COUNT(*) FROM rooms   WHERE active=1').fetchone()[0],
        'constraints': db.execute('SELECT COUNT(*) FROM constraints WHERE active=1').fetchone()[0],
        'proposed':    db.execute("SELECT COUNT(*) FROM schedule_entries WHERE status='proposed'").fetchone()[0],
        'confirmed':   db.execute("SELECT COUNT(*) FROM schedule_entries WHERE status='confirmed'").fetchone()[0],
        'unscheduled': db.execute('''
            SELECT COUNT(*) FROM courses c WHERE active=1
            AND NOT EXISTS (
                SELECT 1 FROM schedule_entries se
                WHERE se.course_id = c.id AND se.status != 'rejected'
            )
        ''').fetchone()[0],
    }
    db.close()
    files_present = os.path.exists(ENROLLMENT_FILE)
    return render_template('index.html', stats=stats, files_present=files_present)


# ── Import ────────────────────────────────────────────────────────────────────

@app.route('/import', methods=['GET', 'POST'])
def import_page():
    if request.method == 'POST':
        action = request.form.get('action', 'upload')

        if action == 'quick':
            msgs = []
            if os.path.exists(ENROLLMENT_FILE):
                c, e = import_courses(ENROLLMENT_FILE)
                msgs.append(f'{c} courses and {e} schedule entries imported from enrollment file.')
            else:
                msgs.append('Enrollment file not found in project directory.')
            if os.path.exists(ROOM_GRID_FILE):
                r = import_rooms_from_grid(ROOM_GRID_FILE)
                msgs.append(f'Room grid processed ({r} new rooms added).')
            else:
                msgs.append('Room grid file not found.')
            flash(' | '.join(msgs), 'success')
            return redirect(url_for('index'))

        if action == 'upload':
            msgs = []
            enrollment_file = request.files.get('enrollment')
            if enrollment_file and enrollment_file.filename:
                path = os.path.join(BASE_DIR, '_upload_enrollment.xlsx')
                enrollment_file.save(path)
                c, e = import_courses(path)
                os.remove(path)
                msgs.append(f'{c} courses and {e} entries imported.')

            room_file = request.files.get('room_grid')
            if room_file and room_file.filename:
                path = os.path.join(BASE_DIR, '_upload_rooms.xlsx')
                room_file.save(path)
                r = import_rooms_from_grid(path)
                os.remove(path)
                msgs.append(f'Room grid processed ({r} new rooms).')

            if msgs:
                flash(' | '.join(msgs), 'success')
            else:
                flash('No files uploaded.', 'warning')
            return redirect(url_for('index'))

    return render_template('import.html', files_present=os.path.exists(ENROLLMENT_FILE))


# ── Courses ───────────────────────────────────────────────────────────────────

@app.route('/courses')
def courses():
    db = get_db()
    rows = db.execute('''
        SELECT c.*,
               (SELECT COUNT(*) FROM schedule_entries se
                WHERE se.course_id=c.id AND se.status!='rejected') as has_entry
        FROM courses c WHERE c.active=1
        ORDER BY c.course_type, c.course_no, c.section
    ''').fetchall()
    db.close()
    return render_template('courses.html', courses=rows)


@app.route('/courses/add', methods=['POST'])
def courses_add():
    db = get_db()
    db.execute('''
        INSERT INTO courses (crn, area, course_no, section, title, max_enrollment,
            adj_enrollment, course_type, credits, instructor_last, instructor_first)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ''', (
        request.form.get('crn', ''),
        request.form.get('area', ''),
        request.form.get('course_no', ''),
        request.form.get('section', '01'),
        request.form.get('title', ''),
        int(request.form.get('max_enrollment', 0)),
        int(request.form.get('adj_enrollment', 0)),
        request.form.get('course_type', 'Elective'),
        int(request.form.get('credits', 3)),
        request.form.get('instructor_last', ''),
        request.form.get('instructor_first', ''),
    ))
    db.commit()
    db.close()
    flash('Course added.', 'success')
    return redirect(url_for('courses'))


@app.route('/courses/<int:course_id>/edit', methods=['POST'])
def courses_edit(course_id):
    db = get_db()
    db.execute('''
        UPDATE courses SET crn=?, area=?, course_no=?, section=?, title=?,
            max_enrollment=?, adj_enrollment=?, course_type=?, credits=?,
            instructor_last=?, instructor_first=?
        WHERE id=?
    ''', (
        request.form.get('crn', ''),
        request.form.get('area', ''),
        request.form.get('course_no', ''),
        request.form.get('section', '01'),
        request.form.get('title', ''),
        int(request.form.get('max_enrollment', 0)),
        int(request.form.get('adj_enrollment', 0)),
        request.form.get('course_type', 'Elective'),
        int(request.form.get('credits', 3)),
        request.form.get('instructor_last', ''),
        request.form.get('instructor_first', ''),
        course_id,
    ))
    db.commit()
    db.close()
    flash('Course updated.', 'success')
    return redirect(url_for('courses'))


@app.route('/courses/<int:course_id>/delete', methods=['POST'])
def courses_delete(course_id):
    db = get_db()
    db.execute('UPDATE courses SET active=0 WHERE id=?', (course_id,))
    db.execute("DELETE FROM schedule_entries WHERE course_id=? AND status='proposed'", (course_id,))
    db.commit()
    db.close()
    flash('Course removed.', 'info')
    return redirect(url_for('courses'))


# ── Rooms ─────────────────────────────────────────────────────────────────────

@app.route('/rooms')
def rooms():
    db = get_db()
    rows = db.execute('SELECT * FROM rooms WHERE active=1 ORDER BY building, name').fetchall()
    db.close()
    return render_template('rooms.html', rooms=rows)


@app.route('/rooms/add', methods=['POST'])
def rooms_add():
    db = get_db()
    db.execute(
        'INSERT OR IGNORE INTO rooms (name, capacity, room_type, building) VALUES (?,?,?,?)',
        (request.form['name'], int(request.form.get('capacity', 0)),
         request.form.get('room_type', 'Standard'),
         request.form.get('building', 'Miller'))
    )
    db.commit()
    db.close()
    flash('Room added.', 'success')
    return redirect(url_for('rooms'))


@app.route('/rooms/<int:room_id>/edit', methods=['POST'])
def rooms_edit(room_id):
    db = get_db()
    db.execute(
        'UPDATE rooms SET name=?, capacity=?, room_type=?, building=? WHERE id=?',
        (request.form['name'], int(request.form.get('capacity', 0)),
         request.form.get('room_type', 'Standard'),
         request.form.get('building', 'Miller'), room_id)
    )
    db.commit()
    db.close()
    flash('Room updated.', 'success')
    return redirect(url_for('rooms'))


@app.route('/rooms/<int:room_id>/delete', methods=['POST'])
def rooms_delete(room_id):
    db = get_db()
    db.execute('UPDATE rooms SET active=0 WHERE id=?', (room_id,))
    db.commit()
    db.close()
    flash('Room deactivated.', 'info')
    return redirect(url_for('rooms'))


# ── Constraints ───────────────────────────────────────────────────────────────

@app.route('/constraints')
def constraints():
    db = get_db()
    rows = db.execute(
        'SELECT * FROM constraints WHERE active=1 ORDER BY category, created_at'
    ).fetchall()
    db.close()
    return render_template('constraints.html', constraints=rows)


@app.route('/constraints/add', methods=['POST'])
def constraints_add():
    db = get_db()
    db.execute(
        'INSERT INTO constraints (category, instructor_name, description) VALUES (?,?,?)',
        (request.form.get('category', 'general'),
         request.form.get('instructor_name', ''),
         request.form['description'])
    )
    db.commit()
    db.close()
    flash('Constraint added.', 'success')
    return redirect(url_for('constraints'))


@app.route('/constraints/<int:cid>/delete', methods=['POST'])
def constraints_delete(cid):
    db = get_db()
    db.execute('UPDATE constraints SET active=0 WHERE id=?', (cid,))
    db.commit()
    db.close()
    flash('Constraint removed.', 'info')
    return redirect(url_for('constraints'))


# ── Schedule ──────────────────────────────────────────────────────────────────

@app.route('/schedule')
def schedule():
    db = get_db()
    entries, rooms, slots_by_day, grid, instructor_conflicts = _schedule_grid()

    # Unscheduled courses
    scheduled_ids = {e['course_id'] for e in entries}
    all_courses = [dict(r) for r in db.execute(
        'SELECT * FROM courses WHERE active=1 ORDER BY course_type, course_no, section'
    ).fetchall()]
    unscheduled = [c for c in all_courses if c['id'] not in scheduled_ids]

    all_slots = [dict(r) for r in db.execute(
        'SELECT * FROM time_slots ORDER BY days, start_time'
    ).fetchall()]

    db.close()
    return render_template('schedule.html',
        entries=entries,
        rooms=rooms,
        slots_by_day=slots_by_day,
        grid=grid,
        unscheduled=unscheduled,
        all_slots=all_slots,
        instructor_conflicts=instructor_conflicts,
        day_tabs=[('MW','Mon / Wed'), ('TR','Tue / Thu'), ('MWF','Mon / Wed / Fri'), ('F','Friday')],
    )


@app.route('/schedule/generate', methods=['POST'])
def schedule_generate():
    db = get_db()

    courses    = [dict(r) for r in db.execute('SELECT * FROM courses WHERE active=1').fetchall()]
    rooms_list = [dict(r) for r in db.execute('SELECT * FROM rooms WHERE active=1').fetchall()]
    slots      = [dict(r) for r in db.execute('SELECT * FROM time_slots ORDER BY days, start_time').fetchall()]
    consts     = [dict(r) for r in db.execute('SELECT * FROM constraints WHERE active=1').fetchall()]

    confirmed = [dict(r) for r in db.execute('''
        SELECT se.course_id, se.room_id, se.slot_id,
               c.course_no, c.section,
               r.name as room_name, ts.label as slot_label
        FROM schedule_entries se
        JOIN courses c  ON se.course_id=c.id
        JOIN rooms r    ON se.room_id=r.id
        JOIN time_slots ts ON se.slot_id=ts.id
        WHERE se.status='confirmed'
    ''').fetchall()]

    proposed = [dict(r) for r in db.execute('''
        SELECT se.course_id, se.room_id, se.slot_id,
               c.course_no, c.section,
               r.name as room_name, ts.label as slot_label
        FROM schedule_entries se
        JOIN courses c  ON se.course_id=c.id
        JOIN rooms r    ON se.room_id=r.id
        JOIN time_slots ts ON se.slot_id=ts.id
        WHERE se.status='proposed'
    ''').fetchall()]

    db.close()

    try:
        result = generate_schedule(courses, rooms_list, slots, consts, confirmed, proposed)
    except Exception as exc:
        flash(f'Schedule generation failed: {exc}', 'danger')
        return redirect(url_for('schedule'))

    if not result:
        flash('Claude returned an empty schedule. Check your API key and try again.', 'danger')
        return redirect(url_for('schedule'))

    confirmed_ids = {c['course_id'] for c in confirmed}

    db = get_db()
    db.execute("DELETE FROM schedule_entries WHERE status='proposed'")

    added = 0
    for item in result:
        cid = item.get('course_id')
        rid = item.get('room_id')
        sid = item.get('slot_id')
        if cid and rid and sid and cid not in confirmed_ids:
            db.execute('''
                INSERT INTO schedule_entries (course_id, room_id, slot_id, status, notes)
                VALUES (?,?,?,'proposed',?)
            ''', (cid, rid, sid, item.get('reasoning', '')))
            added += 1

    db.commit()
    db.close()
    flash(f'AI generated {added} proposed assignments. Review below and confirm what looks good.', 'success')
    return redirect(url_for('schedule'))


@app.route('/schedule/<int:entry_id>/confirm', methods=['POST'])
def entry_confirm(entry_id):
    db = get_db()
    db.execute("UPDATE schedule_entries SET status='confirmed' WHERE id=?", (entry_id,))
    db.commit()
    db.close()
    return redirect(url_for('schedule'))


@app.route('/schedule/<int:entry_id>/reject', methods=['POST'])
def entry_reject(entry_id):
    db = get_db()
    db.execute("UPDATE schedule_entries SET status='rejected' WHERE id=?", (entry_id,))
    db.commit()
    db.close()
    return redirect(url_for('schedule'))


@app.route('/schedule/<int:entry_id>/move', methods=['POST'])
def entry_move(entry_id):
    new_room = request.form.get('room_id', type=int)
    new_slot = request.form.get('slot_id', type=int)
    if not new_room or not new_slot:
        flash('Please select both a room and a time slot.', 'warning')
        return redirect(url_for('schedule'))
    db = get_db()
    db.execute(
        'UPDATE schedule_entries SET room_id=?, slot_id=?, status=? WHERE id=?',
        (new_room, new_slot, 'proposed', entry_id)
    )
    db.commit()
    db.close()
    flash('Entry moved.', 'success')
    return redirect(url_for('schedule'))


@app.route('/schedule/confirm-all', methods=['POST'])
def schedule_confirm_all():
    db = get_db()
    db.execute("UPDATE schedule_entries SET status='confirmed' WHERE status='proposed'")
    db.commit()
    db.close()
    flash('All proposed entries confirmed.', 'success')
    return redirect(url_for('schedule'))


@app.route('/schedule/clear-proposed', methods=['POST'])
def schedule_clear_proposed():
    db = get_db()
    db.execute("DELETE FROM schedule_entries WHERE status='proposed'")
    db.commit()
    db.close()
    flash('All proposed entries cleared.', 'info')
    return redirect(url_for('schedule'))


@app.route('/schedule/reset', methods=['POST'])
def schedule_reset():
    db = get_db()
    db.execute('DELETE FROM schedule_entries')
    db.commit()
    db.close()
    flash('Schedule fully reset.', 'warning')
    return redirect(url_for('schedule'))


# ── Settings ──────────────────────────────────────────────────────────────────

@app.route('/settings', methods=['GET', 'POST'])
def settings():
    if request.method == 'POST':
        api_key = request.form.get('api_key', '').strip()
        if api_key and api_key.startswith('AIza'):
            _save_env_key('GOOGLE_API_KEY', api_key)
            flash('API key saved successfully! You can now generate schedules.', 'success')
        elif api_key:
            flash('That does not look like a valid Google API key (should start with AIza).', 'danger')
        else:
            flash('Please enter your API key.', 'warning')
        return redirect(url_for('settings'))

    key = os.environ.get('GOOGLE_API_KEY', '')
    if len(key) > 12:
        masked = f"{key[:10]}{'*' * (len(key) - 14)}{key[-4:]}"
    else:
        masked = None
    return render_template('settings.html', masked_key=masked, has_key=bool(key))


# ── Conflicts API (JSON) ───────────────────────────────────────────────────────

@app.route('/api/conflicts')
def api_conflicts():
    entries, _, _, grid, instructor_conflicts = _schedule_grid()
    room_conflicts = []
    for days, slot_map in grid.items():
        for slot_id, room_map in slot_map.items():
            for room_id, cell_entries in room_map.items():
                if len(cell_entries) > 1:
                    room_conflicts.append({
                        'days': days, 'slot_id': slot_id, 'room_id': room_id,
                        'entries': [e['id'] for e in cell_entries]
                    })
    return jsonify({
        'room_conflicts': room_conflicts,
        'instructor_conflicts': list(instructor_conflicts),
    })


if __name__ == '__main__':
    import threading, webbrowser, time

    def _open_browser():
        time.sleep(1.5)
        webbrowser.open('http://127.0.0.1:5000')

    threading.Thread(target=_open_browser, daemon=True).start()
    app.run(debug=False, host='127.0.0.1', port=5000)
