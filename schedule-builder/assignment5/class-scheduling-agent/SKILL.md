---
name: class-scheduling-agent
description: >
  Multi-agent course scheduling system for university academic scheduling.
  Trigger words: schedule courses, assign classrooms, detect conflicts,
  generate schedule, room assignment, time slot, instructor conflict,
  course scheduling, Mason School, Fall schedule, BUAD, accreditation.
---

## Overview

The **Class Scheduling Agent** is a multi-agent LangChain system that automates
course-to-room-to-time-slot assignment for the Mason School of Business at
William & Mary. It coordinates two specialist sub-agents—a **Scheduling Advisor**
and a **Conflict Detector**—under a master **Orchestrator**.

Use this skill when you need to:
- Generate a proposed course schedule from courses, rooms, and constraints in the database
- Detect and resolve room double-bookings, instructor conflicts, or capacity violations
- Explain scheduling decisions with reasoning tied to institutional rules
- Audit an existing schedule for compliance with constraints

---

## Instructions

### Step 1 – Environment Setup
Ensure the following are in your `.env` file before running:
```
GOOGLE_API_KEY=your_google_api_key_here
TAVILY_API_KEY=your_tavily_api_key_here
```
Also ensure `schedule.db` exists (run `app.py` at least once to initialize it).

### Step 2 – Install Dependencies
```bash
pip install langchain langgraph langchain-google-genai tavily-python python-dotenv
```

### Step 3 – Run the Agent Script
```bash
python assignment5_scheduling_agents.py
```
The script runs all 8 components sequentially and prints results to stdout.

### Step 4 – Invoke the Orchestrator for a Schedule
Call `orchestrator_agent.invoke()` with a `HumanMessage` describing what you
want scheduled. Example:
```python
from langchain_core.messages import HumanMessage
result = orchestrator_agent.invoke({
    "messages": [HumanMessage(content="Schedule all Core courses for Fall 2026.")]
})
print(result["messages"][-1].content)
```
The orchestrator will:
1. Call `call_scheduling_agent` to get room/slot recommendations
2. Call `call_conflict_agent` to validate for conflicts
3. Return a final validated summary

### Step 5 – Use Memory for Multi-Turn Conflict Review
Use `conflict_agent_with_memory` with a fixed `thread_id` to maintain context
across multiple follow-up questions in one review session:
```python
config = {"configurable": {"thread_id": "my-review-session"}}
conflict_agent_with_memory.invoke({"messages": [HumanMessage(content="...")]}, config)
```

---

## Output Format

### Orchestrator Final Response
The orchestrator produces a plain-text summary containing:
- A list of proposed course assignments (course code → room → time slot)
- Any conflicts found and how they were resolved
- A statement confirming the schedule is conflict-free (or listing remaining issues)

### Conflict Detection Tool Output
`check_schedule_conflicts` returns JSON:
```json
{
  "conflicts": [
    {
      "type": "room_conflict | instructor_conflict | capacity_violation",
      "description": "Human-readable explanation of the conflict"
    }
  ],
  "summary": {
    "total": 2,
    "room_conflicts": 1,
    "instructor_conflicts": 0,
    "capacity_violations": 1
  }
}
```

### Schedule Recommendation Format
Scheduling Advisor recommendations follow the pattern used in `scheduler.py`:
```json
[
  {
    "course_id": 12,
    "room_id": 3,
    "slot_id": 5,
    "reasoning": "Core course assigned to prime-time MW slot; room capacity 40 >= enrollment 35"
  }
]
```

---

## Rules and Edge Cases

1. **Capacity hard rule**: Never assign a course to a room where `capacity < adj_enrollment`.
   The conflict detector will always flag this.

2. **Friday-only labs**: 1-credit lab sections (e.g., BUAD 231L) must be scheduled
   in `F` (Friday-only) time slots. Do not assign them to MW or TR slots.

3. **BUAD 200 MWF**: BUAD 200 is a 3-credit MWF course. It must use `MWF` slots.

4. **Confirmed entries are locked**: Courses with `status='confirmed'` in the
   database must not be reassigned. The scheduling agent is instructed to skip these.

5. **Empty database**: If no courses or rooms exist in `schedule.db`, agents will
   return empty results. Import data via the Flask app's `/import` page first.

6. **Unschedulable courses**: If a course truly cannot be placed (no valid room or
   slot exists), the scheduling agent will return `room_id: null, slot_id: null`
   with a clear explanation in the `reasoning` field.

---

## Safety Guardrails

- **No destructive writes**: This skill is read-only with respect to the database.
  The agents and tools in this skill only `SELECT` from `schedule.db`; they do not
  `INSERT`, `UPDATE`, or `DELETE` any records. All schedule changes must be made
  deliberately through the Flask app's confirm/reject workflow.

- **API key protection**: API keys are loaded from `.env` and never logged or
  returned in agent output. Do not pass raw keys as tool arguments.

- **Input validation**: `check_schedule_conflicts` validates that its input is
  parseable JSON before processing. Malformed input returns an error object rather
  than raising an exception.

- **Rate limiting**: `web_search` is limited to 3 results per call to avoid
  excessive Tavily API usage. Do not call it in a tight loop.
