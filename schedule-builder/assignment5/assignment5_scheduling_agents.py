# ==============================================================================
# AI Assignment 5 – Multi-Agent Course Scheduling System
# William & Mary MSBA | Team Assignment
# Domain: Academic Course Scheduling (Mason School of Business, Fall 2026)
#
# Prerequisites – install once:
#   pip install langchain langgraph langchain-google-genai
#   pip install tavily-python python-dotenv
#
# Environment variables required in .env:
#   GOOGLE_API_KEY=your_google_api_key
#   TAVILY_API_KEY=your_tavily_api_key
#
# Note: Run the Flask app (app.py) at least once to initialize schedule.db
#       before running this script, so the database tables exist.
# ==============================================================================

import os
import json
import sqlite3
from typing import Dict, Any, List

from dotenv import load_dotenv
load_dotenv()

from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage, AIMessage
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent as create_agent
from langgraph.checkpoint.memory import InMemorySaver
from tavily import TavilyClient

# Path to the SQLite database used by the Flask scheduling app
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schedule.db")


def get_db_connection():
    """Open a connection to the scheduling SQLite database."""
    if not os.path.exists(DB_PATH):
        raise FileNotFoundError(
            f"Database not found at {DB_PATH}. "
            "Please run app.py first to initialize the database."
        )
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ==============================================================================
# COMPONENT 1 – LLM Initialization
# ==============================================================================
print("\n" + "=" * 60)
print("COMPONENT 1: LLM Initialization")
print("=" * 60)

# Initialize the LLM using init_chat_model (Gemini 2.5 Flash)
llm = init_chat_model(model="google_genai:gemini-2.5-flash")

# Invoke the model directly – no agent, no tools
direct_prompt = "In two sentences, what makes a conflict-free university course schedule?"
direct_response = llm.invoke(direct_prompt)
print("\nDirect LLM response (default temperature):")
print(direct_response.content)

# Experiment: compare high vs. low temperature on the same prompt
llm_creative = init_chat_model(model="google_genai:gemini-2.5-flash", temperature=1.5)
llm_precise  = init_chat_model(model="google_genai:gemini-2.5-flash", temperature=0.0)

print("\nHigh temperature (1.5) – more creative / varied:")
print(llm_creative.invoke(direct_prompt).content)

print("\nLow temperature (0.0) – deterministic / factual:")
print(llm_precise.invoke(direct_prompt).content)


# ==============================================================================
# COMPONENT 5 – Custom Tools
# (Defined before agents because agents are constructed with these tools)
# ==============================================================================
print("\n" + "=" * 60)
print("COMPONENT 5: Custom Tools")
print("=" * 60)


@tool
def get_courses(course_type: str = "all") -> str:
    """
    Retrieve active courses from the Mason School scheduling database.

    Args:
        course_type: Filter by course type. One of 'Core', 'Required',
                     'Elective', 'Prerequisite', or 'all' (default).

    Returns:
        JSON string listing each course with fields: id, course_no, section,
        title, adj_enrollment, course_type, credits, instructor_last.
    """
    conn = get_db_connection()
    if course_type.lower() == "all":
        rows = conn.execute(
            "SELECT id, course_no, section, title, adj_enrollment, course_type, "
            "credits, instructor_last FROM courses WHERE active=1 "
            "ORDER BY course_type, course_no, section"
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT id, course_no, section, title, adj_enrollment, course_type, "
            "credits, instructor_last FROM courses WHERE active=1 AND course_type=? "
            "ORDER BY course_no, section",
            (course_type,),
        ).fetchall()
    conn.close()
    return json.dumps([dict(r) for r in rows], indent=2)


@tool
def get_available_rooms(min_capacity: int = 0) -> str:
    """
    Retrieve active classrooms from the scheduling database.

    Args:
        min_capacity: Minimum seating capacity required.
                      Pass 0 (default) to return all active rooms.

    Returns:
        JSON string listing each room with fields: id, name, capacity,
        room_type, building.
    """
    conn = get_db_connection()
    rows = conn.execute(
        "SELECT id, name, capacity, room_type, building FROM rooms "
        "WHERE active=1 AND capacity >= ? ORDER BY building, name",
        (min_capacity,),
    ).fetchall()
    conn.close()
    return json.dumps([dict(r) for r in rows], indent=2)


@tool
def check_schedule_conflicts(schedule_json: str) -> str:
    """
    Analyze a proposed course schedule for conflicts and capacity violations.

    Detects three categories of issues:
    - Room double-booking: same room assigned to two courses at the same time slot.
    - Instructor conflict: same instructor teaching two courses in the same slot.
    - Capacity violation: course enrollment exceeds room capacity.

    Args:
        schedule_json: JSON array string. Each element must include the fields:
            course_id, room_id, slot_id, course_no, section, instructor_last,
            adj_enrollment, room_capacity.

    Returns:
        JSON string with a 'conflicts' list (each entry has 'type' and
        'description') and a 'summary' with total counts per conflict type.
    """
    try:
        entries = json.loads(schedule_json)
    except json.JSONDecodeError as exc:
        return json.dumps({"error": f"Invalid JSON input: {exc}"})

    room_slot_map: Dict[str, dict] = {}
    instr_slot_map: Dict[str, dict] = {}
    conflicts: List[dict] = []

    for entry in entries:
        if not entry.get("room_id") or not entry.get("slot_id"):
            continue

        # Room double-booking check
        room_key = f"{entry['room_id']}::{entry['slot_id']}"
        if room_key in room_slot_map:
            other = room_slot_map[room_key]
            conflicts.append({
                "type": "room_conflict",
                "description": (
                    f"Room {entry['room_id']} is double-booked at slot {entry['slot_id']}: "
                    f"BUAD {entry.get('course_no')}-{entry.get('section')} vs "
                    f"BUAD {other.get('course_no')}-{other.get('section')}"
                ),
            })
        else:
            room_slot_map[room_key] = entry

        # Instructor conflict check
        instructor = entry.get("instructor_last")
        if instructor:
            instr_key = f"{instructor}::{entry['slot_id']}"
            if instr_key in instr_slot_map:
                other = instr_slot_map[instr_key]
                conflicts.append({
                    "type": "instructor_conflict",
                    "description": (
                        f"Instructor {instructor} has two courses at slot {entry['slot_id']}: "
                        f"BUAD {entry.get('course_no')}-{entry.get('section')} vs "
                        f"BUAD {other.get('course_no')}-{other.get('section')}"
                    ),
                })
            else:
                instr_slot_map[instr_key] = entry

        # Capacity violation check
        enrollment = entry.get("adj_enrollment") or 0
        capacity   = entry.get("room_capacity") or 0
        if capacity > 0 and enrollment > capacity:
            conflicts.append({
                "type": "capacity_violation",
                "description": (
                    f"BUAD {entry.get('course_no')}-{entry.get('section')}: "
                    f"enrollment {enrollment} exceeds room capacity {capacity}"
                ),
            })

    return json.dumps({
        "conflicts": conflicts,
        "summary": {
            "total": len(conflicts),
            "room_conflicts":      sum(1 for c in conflicts if c["type"] == "room_conflict"),
            "instructor_conflicts": sum(1 for c in conflicts if c["type"] == "instructor_conflict"),
            "capacity_violations": sum(1 for c in conflicts if c["type"] == "capacity_violation"),
        },
    }, indent=2)


@tool
def get_instructor_courses(instructor_last: str) -> str:
    """
    Retrieve all active courses for a specific instructor, including any
    current room and time-slot assignments.

    Args:
        instructor_last: The instructor's last name (case-insensitive).

    Returns:
        JSON string with each course's code, title, enrollment, credits,
        assigned slot, and assigned room (if already scheduled).
    """
    conn = get_db_connection()
    rows = conn.execute(
        """
        SELECT c.course_no, c.section, c.title, c.adj_enrollment, c.credits,
               se.status,
               ts.label  AS slot_label,
               ts.days,
               r.name    AS room_name
        FROM   courses c
        LEFT JOIN schedule_entries se ON se.course_id = c.id
                                      AND se.status != 'rejected'
        LEFT JOIN time_slots ts ON ts.id = se.slot_id
        LEFT JOIN rooms      r  ON r.id  = se.room_id
        WHERE  c.active = 1
        AND    LOWER(c.instructor_last) = LOWER(?)
        ORDER  BY c.course_no, c.section
        """,
        (instructor_last,),
    ).fetchall()
    conn.close()
    result = [dict(r) for r in rows]
    if not result:
        return json.dumps({"message": f"No active courses found for '{instructor_last}'"})
    return json.dumps(result, indent=2)


@tool
def get_scheduling_constraints() -> str:
    """
    Retrieve all active scheduling constraints from the database.

    Constraints may be instructor-specific (e.g., 'Prof. Smith unavailable
    before 10 AM') or general (e.g., 'No Core courses after 5 PM').

    Returns:
        JSON string listing each constraint with id, category,
        instructor_name (if applicable), and description.
    """
    conn = get_db_connection()
    rows = conn.execute(
        "SELECT id, category, instructor_name, description "
        "FROM constraints WHERE active=1 ORDER BY category"
    ).fetchall()
    conn.close()
    return json.dumps([dict(r) for r in rows], indent=2)


print("Custom tools registered:")
for t in [get_courses, get_available_rooms, check_schedule_conflicts,
          get_instructor_courses, get_scheduling_constraints]:
    print(f"  + {t.name}")


# ==============================================================================
# COMPONENT 6 – External API Tool (Tavily Web Search)
# ==============================================================================
print("\n" + "=" * 60)
print("COMPONENT 6: External API Tool (Tavily Web Search)")
print("=" * 60)

tavily_client = TavilyClient(api_key=os.environ.get("TAVILY_API_KEY", ""))


@tool
def web_search(query: str) -> str:
    """
    Search the web for information relevant to course scheduling decisions.

    Use for: academic scheduling best practices, AACSB accreditation
    requirements, course load standards, business school benchmarking,
    or looking up a specific course topic area.

    Args:
        query: A specific natural-language search query.

    Returns:
        A formatted string summarizing the top web results (title, URL,
        and a short excerpt from each result).
    """
    results = tavily_client.search(query, max_results=3)
    snippets = []
    for r in results.get("results", []):
        snippets.append(
            f"Title: {r['title']}\nURL: {r['url']}\nExcerpt: {r['content'][:300]}"
        )
    return "\n\n---\n\n".join(snippets) if snippets else "No web results found."


print("External tool registered: web_search (Tavily)")


# ==============================================================================
# COMPONENT 2 – Agent Creation
# ==============================================================================
print("\n" + "=" * 60)
print("COMPONENT 2: Agent Creation")
print("=" * 60)

# ── Agent 1: Scheduling Advisor ───────────────────────────────────────────────
# Role: Recommends course → room → time-slot assignments using the database
# and web search for accreditation / best-practice context.
SCHEDULING_SYSTEM_PROMPT = """You are an expert course scheduling advisor for
William & Mary's Mason School of Business (Fall 2026 semester).

Your goal is to recommend optimal, conflict-free assignments of courses to
classrooms and time slots. You have tools to query the live scheduling database.

Rules you must follow:
1. Room capacity must be >= course adjusted enrollment.
2. Core and Required courses get priority for prime-time slots (9 AM – 3 PM).
3. Lab sections (1-credit, e.g., BUAD 231L) must use Friday-only slots.
4. BUAD 200 meets MWF; assign it to a MWF slot only.
5. No instructor may teach two courses in the same time slot.
6. Spread sections of the same course number across different days when possible.
7. Honor all constraints in the constraints table.

Always query the database before making recommendations so your answers
reflect the current data.
"""

scheduling_agent = create_agent(
    model=llm,
    tools=[get_courses, get_available_rooms, get_scheduling_constraints, web_search],
    system_prompt=SCHEDULING_SYSTEM_PROMPT,
)
print("+ Scheduling Advisor Agent created")

# ── Agent 2: Conflict Detection Agent ────────────────────────────────────────
# Role: Audits proposed schedules for room conflicts, instructor conflicts,
# and capacity violations. Maintains memory across the conversation.
CONFLICT_SYSTEM_PROMPT = """You are a schedule conflict detection specialist for
William & Mary's Mason School of Business.

Your job is to rigorously audit course schedules and report every problem:
- Room double-bookings: two courses in the same room at the same time
- Instructor conflicts: one instructor assigned to two simultaneous courses
- Capacity violations: enrollment exceeding room capacity
- Constraint violations: assignments that break professor preferences

For every conflict found, explain it clearly and suggest a concrete fix.
Always use the check_schedule_conflicts tool when given a schedule to audit.
Use get_instructor_courses to investigate workload issues per instructor.
"""

conflict_agent = create_agent(
    model=llm,
    tools=[check_schedule_conflicts, get_courses, get_available_rooms,
           get_instructor_courses, get_scheduling_constraints],
    system_prompt=CONFLICT_SYSTEM_PROMPT,
)
print("+ Conflict Detection Agent created")


# ==============================================================================
# COMPONENT 3 – Message Handling (Multi-Turn Conversations)
# ==============================================================================
print("\n" + "=" * 60)
print("COMPONENT 3: Message Handling")
print("=" * 60)

# Build a multi-turn exchange: human question → agent acknowledgment → follow-up
messages = [
    HumanMessage(content="How many active courses are currently in the database?"),
    AIMessage(content="I'll look that up in the scheduling database right now."),
    HumanMessage(
        content="Thanks. Now also tell me how many classrooms are available "
                "with a capacity of at least 30 seats."
    ),
]

response_multi = scheduling_agent.invoke({"messages": messages})
print("\nMulti-turn conversation – final agent response:")
print(response_multi["messages"][-1].content)


# ==============================================================================
# COMPONENT 4 – Streaming Output
# ==============================================================================
print("\n" + "=" * 60)
print("COMPONENT 4: Streaming Output")
print("=" * 60)

stream_prompt = HumanMessage(
    content=(
        "Query the database for Core courses, then recommend the best time slots "
        "for each one. Prioritize prime-time (9 AM – 3 PM) and explain your reasoning."
    )
)

print("\nStreamed response from Scheduling Advisor (stream_mode='messages'):")
print("-" * 50)
for token, metadata in scheduling_agent.stream(
    {"messages": [stream_prompt]},
    stream_mode="messages",
):
    if token.content:
        print(token.content, end="", flush=True)
print("\n" + "-" * 50)


# ==============================================================================
# COMPONENT 7 – Agent Memory (InMemorySaver / Checkpointer)
# ==============================================================================
print("\n" + "=" * 60)
print("COMPONENT 7: Agent Memory")
print("=" * 60)

# Give the conflict agent a checkpointer so it remembers earlier turns
conflict_agent_with_memory = create_agent(
    model=llm,
    tools=[check_schedule_conflicts, get_courses, get_available_rooms,
           get_instructor_courses, get_scheduling_constraints],
    system_prompt=CONFLICT_SYSTEM_PROMPT,
    checkpointer=InMemorySaver(),
)

# All turns sharing this thread_id form one continuous conversation
thread_config = {"configurable": {"thread_id": "conflict-review-fall2026"}}

# Turn 1 – ask the agent to identify high-load instructors
turn1 = HumanMessage(
    content="Which instructors teach more than one active course this semester? "
            "Query the database for all courses."
)
r1 = conflict_agent_with_memory.invoke({"messages": [turn1]}, thread_config)
print("\nMemory – Turn 1 (identify multi-course instructors):")
print(r1["messages"][-1].content[:600])

# Turn 2 – follow-up; agent uses its memory of Turn 1 to answer
turn2 = HumanMessage(
    content="Of those instructors you just found, which ones carry the greatest "
            "scheduling conflict risk if two of their courses were placed in the "
            "same time slot?"
)
r2 = conflict_agent_with_memory.invoke({"messages": [turn2]}, thread_config)
print("\nMemory – Turn 2 (agent recalls Turn 1 context):")
print(r2["messages"][-1].content[:600])


# ==============================================================================
# COMPONENT 8 – Multi-Agent Orchestration
# ==============================================================================
print("\n" + "=" * 60)
print("COMPONENT 8: Multi-Agent Orchestration")
print("=" * 60)

# Wrap each sub-agent as a @tool so the orchestrator can call them
@tool
def call_scheduling_agent(task: str) -> str:
    """
    Delegate a scheduling task to the Scheduling Advisor Agent.

    This sub-agent queries the live database for courses, rooms, time slots,
    and constraints, then recommends optimal room-and-slot assignments.

    Args:
        task: A natural-language description of the scheduling work to perform.

    Returns:
        The Scheduling Advisor's response as a plain string.
    """
    response = scheduling_agent.invoke({"messages": [HumanMessage(content=task)]})
    return response["messages"][-1].content


@tool
def call_conflict_agent(schedule_description: str) -> str:
    """
    Delegate a validation task to the Conflict Detection Agent.

    This sub-agent checks the proposed schedule for room double-bookings,
    instructor conflicts, and capacity violations, then recommends fixes.

    Args:
        schedule_description: A natural-language description or JSON snippet
                               of the proposed schedule to audit.

    Returns:
        The Conflict Detection Agent's findings and recommendations as a string.
    """
    response = conflict_agent.invoke(
        {"messages": [HumanMessage(content=schedule_description)]}
    )
    return response["messages"][-1].content


# ── Orchestrator Agent ────────────────────────────────────────────────────────
ORCHESTRATOR_PROMPT = """You are the Master Scheduling Orchestrator for
William & Mary's Mason School of Business (Fall 2026).

You coordinate two specialist sub-agents to produce a complete, validated
course schedule:

  1. Scheduling Advisor (call_scheduling_agent)
     → Queries the database and recommends course-to-room-to-slot assignments.
     → Call this FIRST to generate scheduling recommendations.

  2. Conflict Detector (call_conflict_agent)
     → Validates proposed assignments for all conflict types.
     → Call this SECOND, passing the Scheduling Advisor's recommendations.

Standard workflow:
  Step 1 – Call the Scheduling Advisor with the user's scheduling request.
  Step 2 – Pass the Advisor's output to the Conflict Detector for validation.
  Step 3 – If conflicts are found, ask the Scheduling Advisor to resolve them.
  Step 4 – Present the final validated schedule summary to the user.

Always explain what each agent found and how you addressed conflicts.
"""

orchestrator_agent = create_agent(
    model=llm,
    tools=[call_scheduling_agent, call_conflict_agent],
    system_prompt=ORCHESTRATOR_PROMPT,
)
print("+ Orchestrator Agent created")

# Run the full orchestration pipeline
orchestration_request = HumanMessage(
    content=(
        "Generate a recommended schedule for the Core courses only. "
        "First get room and time-slot recommendations from the Scheduling Advisor, "
        "then have the Conflict Detector validate the proposal. "
        "Give me a final clean summary of the validated assignments."
    )
)

print("\nOrchestration pipeline – final result:")
print("-" * 50)
orch_result = orchestrator_agent.invoke({"messages": [orchestration_request]})
print(orch_result["messages"][-1].content)
print("-" * 50)

print("\n✓ All 8 components complete.")
