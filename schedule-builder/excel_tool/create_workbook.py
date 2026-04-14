"""
create_workbook.py
==================
Creates ScheduleBuilder.xlsm — a ready-to-use Excel scheduling tool.

What this script does (NO special Excel trust settings required):
  - Creates all sheets with correct headers, formatting, and room data
  - Adds clickable buttons on the Dashboard linked to the VBA macros

After running this script, do ONE manual step:
  1. Open ScheduleBuilder.xlsm in Excel
  2. Press Alt + F11  (opens the Visual Basic Editor)
  3. File > Import File... > select ScheduleBuilder.bas
  4. Close the VBA editor (X button)
  5. Save the file (Ctrl + S)
  Buttons now work!

Requirements:
  pip install pywin32
"""

import os
import sys
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BAS_FILE   = os.path.join(SCRIPT_DIR, "ScheduleBuilder.bas")
OUT_FILE   = os.path.join(SCRIPT_DIR, "ScheduleBuilder.xlsm")

# RGB helper for win32com (Excel uses BGR in some places, but OLE color is RGB)
def rgb(r, g, b):
    return r + (g * 256) + (b * 65536)

NAVY   = rgb(0, 51, 102)
WHITE  = rgb(255, 255, 255)
GREY   = rgb(160, 160, 160)
GREEN  = rgb(0, 128, 0)
BLUE   = rgb(0, 0, 192)


def main():
    if not os.path.exists(BAS_FILE):
        print(f"ERROR: {BAS_FILE} not found.")
        print("Make sure ScheduleBuilder.bas is in the same folder.")
        sys.exit(1)

    try:
        import win32com.client as win32
    except ImportError:
        print("ERROR: pywin32 not installed.  Run:  pip install pywin32")
        sys.exit(1)

    print("Starting Excel...")
    xl = win32.DispatchEx("Excel.Application")
    xl.Visible = False
    xl.DisplayAlerts = False

    wb = None
    try:
        wb = xl.Workbooks.Add()

        # Must save as .xlsm before adding buttons (so macro references are valid)
        if os.path.exists(OUT_FILE):
            os.remove(OUT_FILE)
        wb.SaveAs(Filename=OUT_FILE, FileFormat=52)   # 52 = xlOpenXMLWorkbookMacroEnabled
        print(f"Created: {OUT_FILE}")

        build_dashboard(wb, xl)
        build_courses_sheet(wb)
        build_rooms_sheet(wb)
        build_constraints_sheet(wb)
        build_schedule_sheet(wb)
        build_settings_sheet(wb)

        # Reorder sheets
        order = ["Dashboard", "Courses", "Rooms", "Constraints", "Schedule", "Settings"]
        for i, name in enumerate(order):
            try:
                wb.Sheets(name).Move(Before=wb.Sheets(i + 1))
            except Exception:
                pass

        wb.Sheets("Dashboard").Activate()
        wb.Save()

        print()
        print("=" * 65)
        print("Workbook created successfully!")
        print()
        print("ONE LAST STEP — import the VBA module:")
        print()
        print("  1. Open ScheduleBuilder.xlsm in Excel")
        print("     (click 'Enable Macros' or 'Enable Content' if prompted)")
        print()
        print("  2. Press  Alt + F11  to open the Visual Basic Editor")
        print()
        print("  3. In the VBA editor menu:  File > Import File...")
        print(f"     Navigate to this folder and select:  ScheduleBuilder.bas")
        print()
        print("  4. Close the VBA editor (click the X on the editor window)")
        print()
        print("  5. Press  Ctrl + S  to save")
        print()
        print("  Done!  The buttons on the Dashboard now work.")
        print("=" * 65)

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        if wb:
            try:
                wb.Close(SaveChanges=False)
            except Exception:
                pass
        xl.Quit()
        sys.exit(1)
    finally:
        try:
            if wb:
                wb.Close(SaveChanges=True)
        except Exception:
            pass
        xl.Quit()


# ============================================================
#  Sheet builders
# ============================================================

def build_dashboard(wb, xl):
    ws = get_or_create(wb, "Dashboard")
    ws.Cells.Clear()

    # Title
    c = ws.Range("B2")
    c.Value = "Mason School of Business  |  AI Schedule Builder"
    c.Font.Size = 18
    c.Font.Bold = True
    c.Font.Color = NAVY

    c = ws.Range("B3")
    c.Value = "Agentic AI Scheduling Workflow  |  Fall 2026 Undergraduate"
    c.Font.Size = 11
    c.Font.Color = GREY

    ws.Range("B5").Value = "WORKFLOW  (follow these steps in order)"
    ws.Range("B5").Font.Bold = True
    ws.Range("B5").Font.Size = 11

    steps = [
        "Step 1  Import Enrollment Data    Load course sections from the enrollment Excel file.",
        "Step 2  Copy Prompt to Clipboard  Send your data to Claude (free, claude.ai).",
        "Step 3  Import Claude's Response  Paste Claude's reply and write the schedule.",
        "Step 4  Check for Conflicts       Scan for room, instructor, and capacity problems.",
        "Step 5  Adjust & Re-Check         Fix flagged issues and re-run Check Conflicts.",
    ]
    for i, s in enumerate(steps):
        ws.Range(f"B{6 + i}").Value = s
        ws.Range(f"B{6 + i}").Font.Size = 11

    ws.Range("B12").Value = "NOTES"
    ws.Range("B12").Font.Bold = True
    ws.Range("B12").Font.Size = 11

    c = ws.Range("B13")
    c.Value = "Steps 2 and 3 are FREE -- no API key needed. Just a free claude.ai account."
    c.Font.Color = GREEN

    c = ws.Range("B14")
    c.Value = "Generate with AI automates Steps 2-3 but requires an Anthropic API key (~$0.10/run)."
    c.Font.Color = GREY

    ws.Range("B16").Value = "COLOR KEY"
    ws.Range("B16").Font.Bold = True
    ws.Range("B16").Font.Size = 11

    legend = [
        ("Core",         rgb(220, 230, 241)),
        ("Required",     rgb(226, 239, 218)),
        ("Elective",     rgb(255, 242, 204)),
        ("Prerequisite", rgb(242, 220, 219)),
        ("Conflict",     rgb(255, 199, 206)),
    ]
    for i, (label, color) in enumerate(legend):
        cell = ws.Range(f"B{17 + i}")
        cell.Value = f"   {label}"
        cell.Interior.Color = color
        cell.Font.Size = 10

    btn_left = ws.Cells(1, 5).Left
    btn_w    = 240

    def row_top(r):  return ws.Rows(r).Top + 1
    def row_h(r):    return ws.Rows(r).Height - 2

    add_button(ws, "Step 1  Import Enrollment Data",
               "ScheduleBuilder.ImportEnrollmentData",
               btn_left, row_top(6), btn_w, row_h(6))
    add_button(ws, "Step 2  Copy Prompt to Clipboard",
               "ScheduleBuilder.CopyPromptToClipboard",
               btn_left, row_top(7), btn_w, row_h(7))
    add_button(ws, "Step 3  Import Claude's Response",
               "ScheduleBuilder.ImportClaudeResponse",
               btn_left, row_top(8), btn_w, row_h(8))
    add_button(ws, "Step 4  Check for Conflicts",
               "ScheduleBuilder.CheckConflicts",
               btn_left, row_top(9), btn_w, row_h(9))
    add_button(ws, "Generate with AI (API Key)",
               "ScheduleBuilder.GenerateWithAI",
               btn_left, row_top(14), btn_w, row_h(14))
    add_button(ws, "Clear Schedule",
               "ScheduleBuilder.ClearSchedule",
               btn_left, row_top(21), 130, row_h(21))

    ws.Columns("A").ColumnWidth = 2
    ws.Columns("B").ColumnWidth = 78
    ws.Tab.Color = NAVY
def build_courses_sheet(wb):
    ws = get_or_create(wb, "Courses")
    ws.Cells.Clear()

    headers = ["CRN", "Course Code", "Title", "Section", "Enrollment",
               "Max Capacity", "Credits", "Type", "Days", "Timeslot",
               "Room", "Instructor", "Notes"]
    header_row(ws, 1, headers)

    # Example / placeholder row (italic grey — skipped by prompt builder)
    ex = ["12345", "BUAD 301-01", "Financial Accounting", "01",
          "45", "60", "3", "Core", "MW", "9:00 AM - 10:15 AM",
          "1082", "Smith, John", "EXAMPLE — replace with real data"]
    for c, v in enumerate(ex, 1):
        cell = ws.Cells(2, c)
        cell.Value = v
        cell.Font.Italic = True
        cell.Font.Color = GREY

    widths = [10, 16, 38, 10, 13, 15, 10, 14, 10, 22, 12, 22, 35]
    for c, w in enumerate(widths, 1):
        ws.Columns(c).ColumnWidth = w

    freeze_at(ws, "A2")
    ws.Tab.Color = rgb(0, 112, 192)


def build_rooms_sheet(wb):
    ws = get_or_create(wb, "Rooms")
    ws.Cells.Clear()

    headers = ["Room", "Building", "Capacity", "Room Type", "Notes / Special Features"]
    header_row(ws, 1, headers)

    rooms = [
        ("1005",     "Miller Hall",              120, "Flat",              ""),
        ("1008",     "Miller Hall",               32, "Design Lab",        "Design studio layout — specialized"),
        ("1013",     "Miller Hall",               50, "Flat",              ""),
        ("1018",     "Miller Hall",               50, "Flat",              ""),
        ("1019",     "Miller Hall",               46, "Finance/Markets Lab","Bloomberg terminals — specialized"),
        ("1027",     "Miller Hall",               50, "Flat",              ""),
        ("1066",     "Miller Hall",               24, "Seminar",           "Seminar/conference layout — small groups"),
        ("1069",     "Miller Hall",               48, "Flat",              ""),
        ("1077",     "Miller Hall",               45, "Cluster",           "Cluster/pod seating"),
        ("1078",     "Miller Hall",               50, "Flat",              ""),
        ("1082",     "Miller Hall",               60, "Tiered",            "Tiered lecture hall"),
        ("1088",     "Miller Hall",               60, "Tiered",            "Tiered lecture hall"),
        ("1090",     "Miller Hall",               50, "Flat",              ""),
        ("2003",     "Miller Hall",               50, "Flat",              ""),
        ("2052",     "Miller Hall",               50, "Flat",              ""),
        ("ISC 1127", "Integrated Science Center", 180, "Large Lecture",    "Large lecture hall"),
    ]
    for r, row in enumerate(rooms, 2):
        for c, val in enumerate(row, 1):
            ws.Cells(r, c).Value = val

    ws.Columns(1).ColumnWidth = 14
    ws.Columns(2).ColumnWidth = 26
    ws.Columns(3).ColumnWidth = 12
    ws.Columns(4).ColumnWidth = 20
    ws.Columns(5).ColumnWidth = 45

    freeze_at(ws, "A2")
    ws.Tab.Color = rgb(70, 130, 180)


def build_constraints_sheet(wb):
    ws = get_or_create(wb, "Constraints")
    ws.Cells.Clear()

    c = ws.Range("A1")
    c.Value = "Scheduling Constraints  (Optional)"
    c.Font.Bold = True
    c.Font.Size = 13
    c.Font.Color = NAVY

    c = ws.Range("A2")
    c.Value = "Add real constraints below row 4.  The grey italic rows are examples — delete or ignore them."
    c.Font.Italic = True
    c.Font.Color = GREY

    header_row(ws, 4, ["Type", "Description"])

    examples = [
        ("Room",       "Room 1008 (Design Lab) should only be used for design/experiential courses"),
        ("Room",       "Room 1019 (Finance Lab) should only be used for finance/markets courses"),
        ("Instructor", "Prof. Smith is not available MWF before 10 AM"),
        ("General",    "No classes on Friday afternoons after 3:30 PM if possible"),
        ("General",    "Core courses should be in rooms with capacity 45 or more"),
    ]
    for i, (t, d) in enumerate(examples, 5):
        ws.Cells(i, 1).Value = t
        ws.Cells(i, 2).Value = d
        ws.Cells(i, 1).Font.Italic = True
        ws.Cells(i, 2).Font.Italic = True
        ws.Cells(i, 1).Font.Color = GREY
        ws.Cells(i, 2).Font.Color = GREY

    ws.Columns(1).ColumnWidth = 16
    ws.Columns(2).ColumnWidth = 80
    ws.Tab.Color = rgb(255, 165, 0)


def build_schedule_sheet(wb):
    ws = get_or_create(wb, "Schedule")
    ws.Cells.Clear()

    c = ws.Range("A1")
    c.Value = "Generated Schedule \u2014 Mason School of Business, Fall 2026"
    c.Font.Bold = True
    c.Font.Size = 14
    c.Font.Color = NAVY

    c = ws.Range("A2")
    c.Value = "Not yet generated."
    c.Font.Italic = True
    c.Font.Color = GREY

    headers = ["CRN", "Course Code", "Title", "Enrollment", "Type",
               "Room", "Days", "Start Time", "End Time", "Instructor", "Issues / Notes"]
    header_row(ws, 4, headers)

    widths = [10, 16, 38, 12, 14, 14, 10, 14, 14, 22, 50]
    for c, w in enumerate(widths, 1):
        ws.Columns(c).ColumnWidth = w

    freeze_at(ws, "A5")
    ws.Tab.Color = rgb(0, 176, 80)


def build_settings_sheet(wb):
    ws = get_or_create(wb, "Settings")
    ws.Cells.Clear()

    c = ws.Range("A1")
    c.Value = "Settings  (Do not delete or rename this sheet)"
    c.Font.Bold = True
    c.Font.Color = rgb(150, 0, 0)

    ws.Range("A3").Value = "Anthropic API Key"
    ws.Range("A3").Font.Bold = True
    ws.Range("B3").Value = ""

    instructions = [
        "How to get an API key:",
        "  1. Go to console.anthropic.com and sign in (or create a free account).",
        "  2. Click API Keys in the left sidebar.",
        "  3. Click Create Key, name it Schedule Builder, and copy the key.",
        "  4. Paste it in cell B3 above and save this file.",
        "  Note: The key starts with sk-ant-.  Keep it private.",
        "",
        "Cost estimate: ~$0.05 to $0.15 per schedule generation (Claude Opus 4.6).",
        "Alternatively, use the free Copy Prompt button and paste into claude.ai.",
    ]
    for i, line in enumerate(instructions, 5):
        ws.Cells(i, 1).Value = line
        if i >= 12:
            ws.Cells(i, 1).Font.Italic = True
            ws.Cells(i, 1).Font.Color = GREY

    ws.Columns(1).ColumnWidth = 60
    ws.Columns(2).ColumnWidth = 70

    ws.Visible = 2   # xlSheetVeryHidden = 2
    ws.Tab.Color = GREY


# ============================================================
#  Helper functions
# ============================================================

def get_or_create(wb, name):
    for sh in wb.Sheets:
        if sh.Name == name:
            return sh
    ws = wb.Sheets.Add(After=wb.Sheets(wb.Sheets.Count))
    ws.Name = name
    return ws


def header_row(ws, row_num, headers):
    for c, h in enumerate(headers, 1):
        cell = ws.Cells(row_num, c)
        cell.Value = h
        cell.Font.Bold = True
        cell.Font.Color = WHITE
        cell.Interior.Color = NAVY
        cell.HorizontalAlignment = -4108   # xlCenter
    ws.Rows(row_num).RowHeight = 18


def freeze_at(ws, addr):
    ws.Activate()
    ws.Application.ActiveWindow.FreezePanes = False
    ws.Range(addr).Select()
    ws.Application.ActiveWindow.FreezePanes = True


def add_button(ws, caption, macro, left, top, width, height):
    btn = ws.Buttons().Add(left, top, width, height)
    btn.Caption = caption
    btn.OnAction = macro
    btn.Font.Size = 10
    btn.Font.Bold = True
    return btn


if __name__ == "__main__":
    main()
