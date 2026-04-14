# Assignment 5 – Design Rationale Report
**Team Project: Mason School of Business Course Scheduling Agent**
**Course: MSBA AI | William & Mary**

---

## System Architecture

We built a three-tier multi-agent system in LangChain/LangGraph that layers on
top of the existing `schedule.db` SQLite database from our Flask scheduling app.
All agents use **Gemini 2.5 Flash** (via `init_chat_model`), chosen for its
strong structured-output reliability and low latency on database-driven queries.

```
User Request
     │
     ▼
┌─────────────────────┐
│  Orchestrator Agent  │  ← coordinates sub-agents via @tool wrappers
└──────────┬──────────┘
           │ calls
    ┌──────┴──────┐
    ▼             ▼
┌───────────┐  ┌──────────────────┐
│ Scheduling│  │ Conflict         │
│ Advisor   │  │ Detection Agent  │
│ Agent     │  │ (with memory)    │
└─────┬─────┘  └────────┬─────────┘
      │                  │
  DB tools +         DB tools +
  web_search     check_schedule_conflicts
```

---

## Agent Roles

**Scheduling Advisor** – Given a scheduling request, this agent queries the
live database for courses, rooms, time slots, and constraints, then recommends
assignments. Its system prompt encodes institutional rules (capacity, lab-only
Friday slots, BUAD 200 MWF format, Core-course prime-time priority). It also
has access to `web_search` (Tavily) to look up AACSB accreditation standards
or course-load benchmarks when the user asks for best-practice context.

**Conflict Detection Agent** – A specialist auditor that checks any proposed
schedule for room double-bookings, instructor conflicts, and capacity
violations. It uses `InMemorySaver` (Component 7) so multi-turn review
sessions remain coherent—for example, identifying high-load instructors in
Turn 1 and assessing their conflict risk in Turn 2 without re-querying.

**Orchestrator** – Wraps both sub-agents as `@tool` functions and drives a
fixed two-pass workflow: (1) generate assignments via the Scheduling Advisor,
(2) validate via the Conflict Detector, (3) request fixes if needed. This
separation of generation from validation prevents the common LLM failure mode
of producing internally inconsistent schedules.

---

## Design Decisions

**Why separate generation from validation?** A single agent asked to both
schedule and validate tends to rationalize its own output. Separating concerns
into distinct agents with distinct system prompts gives each one a clear
adversarial role, improving overall schedule quality.

**Why read-only database tools?** Our custom tools only `SELECT` from
`schedule.db`. All confirmed changes still go through the Flask app's
human-review workflow (confirm/reject). This preserves the human-in-the-loop
guarantee that was central to the original project design.

**Why Tavily web search?** AACSB accreditation imposes course-load and contact-
hour requirements that aren't in the local database. The web search tool lets
the Scheduling Advisor pull current standards when the user asks scheduling
questions that go beyond the local data.

**Why InMemorySaver on the Conflict Agent?** Conflict reviews are inherently
iterative—a reviewer asks about one instructor, then drills down. Memory on
the Conflict Agent, not the Scheduling Advisor, keeps the generation step
stateless (reproducible) while making the review step conversational.

---

## Skill Folder Design

The `class-scheduling-agent/` folder is designed to be self-contained:

- **SKILL.md** – YAML frontmatter for discoverability; step-by-step setup,
  invocation, output format, edge cases, and four safety guardrails
  (read-only DB, key protection, input validation, rate limiting).
- **references/** – Concrete example input (database state + invocation code)
  and expected output (validated table + raw JSON from conflict tool), giving
  any team a runnable acceptance test.
- **templates/** – Two reusable Markdown report templates (`schedule_report`
  and `conflict_report`) with placeholder tokens so they can be filled
  programmatically or manually after an agent run.

The folder intentionally omits the Python script itself—keeping it portable so
another team can use the skill documentation without our codebase.
