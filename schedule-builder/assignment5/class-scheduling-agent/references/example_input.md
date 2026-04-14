# Example Input – Class Scheduling Agent

## Scenario
The Mason School of Business needs to schedule its **Core** courses for Fall 2026.
The database contains the following relevant data at the time of this example.

---

## Database State (sample)

### Courses (Core only)
| course_id | course_no | section | title                          | adj_enrollment | instructor_last |
|-----------|-----------|---------|--------------------------------|----------------|-----------------|
| 1         | 200       | 01      | Business Foundations           | 48             | Smith           |
| 2         | 300       | 01      | Financial Accounting           | 35             | Jones           |
| 3         | 300       | 02      | Financial Accounting           | 32             | Jones           |
| 4         | 310       | 01      | Managerial Economics           | 40             | Patel           |

### Rooms (active)
| room_id | name        | capacity | room_type | building |
|---------|-------------|----------|-----------|----------|
| 1       | Miller 101  | 50       | Standard  | Miller   |
| 2       | Miller 102  | 40       | Standard  | Miller   |
| 3       | Miller 201  | 35       | Standard  | Miller   |
| 4       | Tyler 100   | 60       | Lecture   | Tyler    |

### Time Slots (sample)
| slot_id | label             | days | start_time | end_time |
|---------|-------------------|------|------------|----------|
| 1       | MWF 9:00-9:50     | MWF  | 09:00      | 09:50    |
| 2       | MW 9:30-10:50     | MW   | 09:30      | 10:50    |
| 3       | MW 11:00-12:20    | MW   | 11:00      | 12:20    |
| 4       | TR 9:30-10:50     | TR   | 09:30      | 10:50    |
| 5       | TR 11:00-12:20    | TR   | 11:00      | 12:20    |

### Constraints
| id | category   | instructor_name | description                              |
|----|------------|-----------------|------------------------------------------|
| 1  | instructor | Jones           | Prof. Jones unavailable before 10:00 AM  |
| 2  | general    |                 | Core courses must be in prime-time slots |

---

## Orchestrator Invocation

```python
from langchain_core.messages import HumanMessage

result = orchestrator_agent.invoke({
    "messages": [
        HumanMessage(
            content=(
                "Generate a recommended schedule for the Core courses only. "
                "First get room and time-slot recommendations from the Scheduling Advisor, "
                "then have the Conflict Detector validate the proposal. "
                "Give me a final clean summary of the validated assignments."
            )
        )
    ]
})
print(result["messages"][-1].content)
```
