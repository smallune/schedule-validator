import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'schedule.db')

DEFAULT_TIME_SLOTS = [
    # Monday / Wednesday
    ('MW 8:00-9:20',   'MW', '08:00', '09:20'),
    ('MW 9:30-10:50',  'MW', '09:30', '10:50'),
    ('MW 11:00-12:20', 'MW', '11:00', '12:20'),
    ('MW 12:30-13:50', 'MW', '12:30', '13:50'),
    ('MW 14:00-15:20', 'MW', '14:00', '15:20'),
    ('MW 15:30-16:50', 'MW', '15:30', '16:50'),
    ('MW 17:00-18:20', 'MW', '17:00', '18:20'),
    ('MW 18:30-19:50', 'MW', '18:30', '19:50'),
    # Tuesday / Thursday
    ('TR 8:00-9:20',   'TR', '08:00', '09:20'),
    ('TR 9:30-10:50',  'TR', '09:30', '10:50'),
    ('TR 11:00-12:20', 'TR', '11:00', '12:20'),
    ('TR 12:30-13:50', 'TR', '12:30', '13:50'),
    ('TR 14:00-15:20', 'TR', '14:00', '15:20'),
    ('TR 15:30-16:50', 'TR', '15:30', '16:50'),
    ('TR 17:00-18:20', 'TR', '17:00', '18:20'),
    ('TR 18:30-19:50', 'TR', '18:30', '19:50'),
    # Monday / Wednesday / Friday
    ('MWF 8:00-8:50',   'MWF', '08:00', '08:50'),
    ('MWF 9:00-9:50',   'MWF', '09:00', '09:50'),
    ('MWF 10:00-10:50', 'MWF', '10:00', '10:50'),
    ('MWF 11:00-11:50', 'MWF', '11:00', '11:50'),
    ('MWF 12:00-12:50', 'MWF', '12:00', '12:50'),
    ('MWF 13:00-13:50', 'MWF', '13:00', '13:50'),
    # Friday only (labs)
    ('F 9:00-11:30',   'F', '09:00', '11:30'),
    ('F 11:30-14:00',  'F', '11:30', '14:00'),
    ('F 13:00-15:30',  'F', '13:00', '15:30'),
    ('F 14:00-16:30',  'F', '14:00', '16:30'),
]


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS rooms (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            name     TEXT NOT NULL UNIQUE,
            capacity INTEGER DEFAULT 0,
            room_type TEXT DEFAULT 'Standard',
            building TEXT DEFAULT 'Miller',
            active   INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS courses (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            crn              TEXT,
            area             TEXT,
            course_no        TEXT,
            section          TEXT,
            title            TEXT,
            max_enrollment   INTEGER DEFAULT 0,
            adj_enrollment   INTEGER DEFAULT 0,
            room_cap         INTEGER DEFAULT 0,
            course_type      TEXT DEFAULT 'Elective',
            credits          INTEGER DEFAULT 3,
            current_days     TEXT,
            current_timeslot TEXT,
            current_room     TEXT,
            instructor_last  TEXT,
            instructor_first TEXT,
            active           INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS time_slots (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            label      TEXT NOT NULL UNIQUE,
            days       TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time   TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS constraints (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            category        TEXT NOT NULL DEFAULT 'general',
            instructor_name TEXT,
            description     TEXT NOT NULL,
            active          INTEGER DEFAULT 1,
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS schedule_entries (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id    INTEGER REFERENCES courses(id),
            room_id      INTEGER REFERENCES rooms(id),
            slot_id      INTEGER REFERENCES time_slots(id),
            status       TEXT DEFAULT 'proposed',
            notes        TEXT,
            generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    ''')

    if conn.execute('SELECT COUNT(*) FROM time_slots').fetchone()[0] == 0:
        conn.executemany(
            'INSERT OR IGNORE INTO time_slots (label, days, start_time, end_time) VALUES (?, ?, ?, ?)',
            DEFAULT_TIME_SLOTS
        )

    conn.commit()
    conn.close()
