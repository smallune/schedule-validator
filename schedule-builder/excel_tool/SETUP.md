# Schedule Builder — Setup Guide

## What you're building
A single Excel file (`ScheduleBuilder.xlsm`) that admins open like any normal spreadsheet.
It has two buttons:
- **Copy Prompt to Clipboard** — free; paste into claude.ai in a browser
- **Generate with AI** — automated; needs an Anthropic API key

---

## Option A — Automated setup (recommended)

Run this once on your Windows machine, then hand the `.xlsm` to the admins.

### Step 1 — Install Python dependency

```
pip install pywin32
```

### Step 2 — Enable VBA trust in Excel (one-time)

1. Open Excel
2. **File → Options → Trust Center → Trust Center Settings...**
3. Click **Macro Settings**
4. Check **Trust access to the VBA project object model**
5. Click **OK** twice, then close Excel

### Step 3 — Run the setup script

```
python create_workbook.py
```

This creates `ScheduleBuilder.xlsm` in the same folder.

### Step 4 — Hand it to the admins

Send them `ScheduleBuilder.xlsm`.
They open it in Excel, enable macros if prompted, and use the Dashboard.

---

## Option B — Manual setup (no Python needed)

If you prefer to create the workbook by hand:

1. Open Excel, create a new workbook.
2. **File → Save As** — choose **Excel Macro-Enabled Workbook (.xlsm)**.
3. Open the **Visual Basic Editor** (`Alt + F11`).
4. In the VBA editor: **File → Import File...** → select `ScheduleBuilder.bas`.
5. Close the VBA editor.
6. In Excel, press `Alt + F8`, select `ScheduleBuilder.SetupWorkbook`, click **Run**.
7. The workbook is now fully set up. Save and distribute.

---

## How admins use it

### Filling in data

| Sheet | What to enter |
|-------|--------------|
| **Courses** | One row per section: CRN, code, title, enrollment, type, etc. |
| **Rooms** | Pre-filled with Miller Hall. Edit as needed. |
| **Constraints** | Optional. E.g. "Prof X not available before 10 AM on MW." |

### Generating a schedule

**Free option (no API key needed):**
1. Click **Copy Prompt to Clipboard** on the Dashboard.
2. Go to [claude.ai](https://claude.ai) in any browser.
3. Start a new conversation and paste (Ctrl+V).
4. Claude returns a formatted schedule — copy it back into Excel if desired.

**Automated option (requires API key):**
1. Get a key at [console.anthropic.com](https://console.anthropic.com).
   - Go to **API Keys → Create Key**.
   - Cost: roughly $0.05–$0.15 per generation.
2. Open `ScheduleBuilder.xlsm`, click **Generate with AI**.
3. Enter the key when prompted (stored in the hidden Settings sheet).
4. Wait 30–90 seconds — the schedule fills in automatically.

### Reading the output

The **Schedule** sheet shows all courses in a sortable table:

| Column | Content |
|--------|---------|
| CRN | Course reference number |
| Course Code | e.g. BUAD 301-01 |
| Title | Course name |
| Enrollment | Number of students |
| Type | Core / Required / Elective / Prerequisite |
| Room | Assigned room |
| Days | MW, TR, MWF, etc. |
| Start / End Time | Class times |
| Instructor | Last name, First name |
| Issues / Notes | Red if Claude flagged a problem |

Color coding:
- **Blue** = Core
- **Green** = Required
- **Yellow** = Elective
- **Pink** = Prerequisite
- **Red Issues cell** = conflict or problem flagged by Claude

---

## Troubleshooting

**"Macros disabled" warning when opening:**
Click **Enable Content** or **Enable Macros** in the yellow bar at the top.

**"API key not found":**
Click Generate with AI and enter the key when prompted, or open Settings (it's hidden — the VBA will reveal it).

**"HTTP 401" error:**
API key is invalid. Double-check it at console.anthropic.com.

**"HTTP 429" error:**
Rate limited. Wait a minute and try again.

**Schedule doesn't appear / parse error:**
Claude occasionally formats output differently. Use Copy Prompt and paste into claude.ai instead — you can read the answer there directly.
