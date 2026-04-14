# Schedule Conflict Validator
### *A Precision Auditing Tool for the W&M Mason School of Business Registrar*

[![Mason School of Business](https://img.shields.io/badge/W%26M-Mason_School_of_Business-004E38?style=flat-square)](https://mason.wm.edu/)
[![Built with React](https://img.shields.io/badge/Built_with-React_19-1565C0?style=flat-square)](https://react.dev/)
[![AI-Powered](https://img.shields.io/badge/AI--Powered-Gemini_1.5_Flash-B79257?style=flat-square)](https://deepmind.google/technologies/gemini/)

## Overview

The **Schedule Conflict Validator** is a specialized web application designed to maintain the integrity of academic course catalogs. Specifically tailored for the unique requirements of the William & Mary Mason School of Business, it automates the tedious process of auditing course schedules for capacity violations, room double-bookings, and instructor overlaps.

### Why this matters:
- **Operational Excellence:** Reduces manual auditing time by over 90%.
- **Student Experience:** Ensures students aren't placed in overcrowded rooms or faced with impossible back-to-back commutes.
- **Resource Optimization:** Identifies underutilized rooms and TBA (To Be Announced) gaps before the semester begins.

---

## Author List
- **Conner Small** ([@smallune](https://github.com/smallune))
- **Alex Farina**
- **Alexa Mikeska**
- **Justin Varela**

---

## Project Scope
The project is narrowly focused on the **Validation and Conflict Resolution** phase of the university scheduling lifecycle.

**In Scope:**
- **Multi-Format Ingestion:** Importing .xlsx and .csv schedules.
- **Audit Engine:** Real-time detection of 7+ conflict types (Capacity, Rooms, Profs, TBA, etc.).
- **Visual Analytics:** Interactive dashboards and heatmaps of room utilization.
- **AI Fix Suggestions:** Intelligent resolution paths powered by Gemini 1.5.
- **Manual Editor:** A high-performance grid for on-the-fly schedule adjustments.

**Out of Scope:**
- Automated initial schedule generation (creation from scratch).
- Student registration/enrollment portal.
- Direct database writes to the University's ERP system.

---

## Project Details

### 1. Audit Engine Logic
The core audit logic (`src/auditLogic.js`) uses a high-performance set-based approach to detect overlaps. It transforms standard university timeslots (e.g., "0930-1045") into absolute minute values and performs interval intersection checks.

### 2. Interactive Schedule Grid
The **Grid View** provides a 2D visualization of the business school's physical assets. Rooms are mapped to columns, and time-slots to rows.
- **Color-Coded by Subject:** (e.g., BNAL in Blue, MKTG in Red).
- **Enrollment Heatbars:** Visual indicators showing how "full" a room is.
- **Conflict Highlighting:** Double-booked rooms are instantly flagged with a crimson border.

### 3. AI Copilot Integration
When a conflict is detected (e.g., Room 101 is double-booked at 11:00 AM), the **Gemini AI Suggest** engine analyzes:
- The requirements of the conflicting course.
- All other room occupancies on that day.
- Standard university timeslot patterns.
It then offers 2–3 specific, actionable fixes (e.g., "Move BNAL 301 to Miller 105, which is free and has 40 seats").

---

## Responsible AI Considerations
This project integrates Generative AI to assist administrators, following these core principles:

1.  **Human-in-the-Loop:** AI never modifies the schedule directly. It provides *suggestions* that must be reviewed, edited, and approved by the Registrar.
2.  **Transparency:** All AI-generated content is clearly labeled within the UI.
3.  **Data Privacy:** Only course metadata (Time, Room, Subject) is sent to the LLM. No student-identifiable information (PII) is ever processed by the AI.
4.  **Rule-Based Grounding:** Suggestions are grounded in the actual room occupancy data provided in the uploaded file, mitigating hallucinations.

---

## What's Next?
1.  **Automated Generator:** Moving from validation to generation using Genetic Algorithms (see References).
2.  **Faculty Preference Portal:** Integrating a front-end for professors to submit their "optimal" teaching windows.
3.  **Cross-Campus Extension:** Scaling the tool beyond the Business School to the entire W&M campus.
4.  **Student Conflict Detection:** Detecting "Schedule Bottlenecks" where two required courses for a major are scheduled at the same time.

### Additional Resources
- [Vite Documentation](https://vitejs.dev/) - Project Build Tool.
- [React 19 RC Blog](https://react.dev/blog/2024/04/25/react-19) - Used for state management and UI components.
- [SheetJS (XLSX)](https://sheetjs.com/) - Powering the Excel parsing engine.
