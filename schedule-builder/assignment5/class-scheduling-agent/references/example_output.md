# Example Output – Class Scheduling Agent

## Orchestrator Final Response (expected)

Below is the expected final output from `orchestrator_agent` given the
[example input](example_input.md).

---

**Orchestrator Summary:**

The Scheduling Advisor recommended the following Core course assignments:

| Course              | Room       | Time Slot          | Notes                                  |
|---------------------|------------|--------------------|----------------------------------------|
| BUAD 200-01 (Smith) | Miller 101 | MWF 9:00-9:50      | MWF slot required; cap 50 >= enroll 48 |
| BUAD 300-01 (Jones) | Miller 102 | MW 11:00-12:20     | Honors constraint: no slots before 10 AM |
| BUAD 300-02 (Jones) | Miller 201 | TR 11:00-12:20     | Spread sections across days; cap 35 >= enroll 32 |
| BUAD 310-01 (Patel) | Miller 102 | TR 9:30-10:50      | Prime-time TR slot; cap 40 >= enroll 40 |

**Conflict Detection Results:**

```json
{
  "conflicts": [],
  "summary": {
    "total": 0,
    "room_conflicts": 0,
    "instructor_conflicts": 0,
    "capacity_violations": 0
  }
}
```

No conflicts detected. The proposed schedule is valid:
- Prof. Jones's two sections are on different days (MW vs. TR), eliminating instructor conflicts.
- All room capacities meet or exceed enrollment.
- BUAD 200-01 is correctly placed in a MWF slot.
- Prof. Jones's constraint (no classes before 10 AM) is respected: both sections start at 11:00 AM.

**Final Validated Schedule: APPROVED** ✓

---

## check_schedule_conflicts Tool Output (sample conflict scenario)

To verify the tool works, here is a sample output when a conflicting schedule
is passed in:

**Input:**
```json
[
  {"course_id": 2, "room_id": 2, "slot_id": 3, "course_no": "300", "section": "01",
   "instructor_last": "Jones", "adj_enrollment": 35, "room_capacity": 40},
  {"course_id": 3, "room_id": 2, "slot_id": 3, "course_no": "300", "section": "02",
   "instructor_last": "Jones", "adj_enrollment": 32, "room_capacity": 40}
]
```

**Output:**
```json
{
  "conflicts": [
    {
      "type": "room_conflict",
      "description": "Room 2 is double-booked at slot 3: BUAD 300-01 vs BUAD 300-02"
    },
    {
      "type": "instructor_conflict",
      "description": "Instructor Jones has two courses at slot 3: BUAD 300-01 vs BUAD 300-02"
    }
  ],
  "summary": {
    "total": 2,
    "room_conflicts": 1,
    "instructor_conflicts": 1,
    "capacity_violations": 0
  }
}
```

This output confirms the tool correctly identifies both a room double-booking
and an instructor conflict when two sections are assigned to the same room and
time slot.
