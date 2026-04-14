Attribute VB_Name = "ScheduleBuilder"
Option Explicit

'=============================================================================
' MASON SCHOOL OF BUSINESS  Schedule Builder
' Agentic AI Scheduling Workflow  Option 4
'
' WORKFLOW
'   Step 1  ImportEnrollmentData  reads the enrollment Excel, fills Courses sheet
'   Step 2  CopyPromptToClipboard  builds prompt, copy/paste into claude.ai (FREE)
'   Step 3  ImportClaudeResponse   paste Claude reply here, auto-writes Schedule sheet
'   Step 4  CheckConflicts         scans schedule for room/instructor/capacity issues
'   Step 5  Admin adjusts, re-runs CheckConflicts until clean
'=============================================================================

' API constants (for optional automated mode)
Private Const API_URL   As String = "https://api.anthropic.com/v1/messages"
Private Const MODEL     As String = "claude-opus-4-6"

' Markers Claude uses to delimit output sections
Private Const SCH_START As String = "<<<SCHEDULE>>>"
Private Const SCH_END   As String = "<<<END>>>"
Private Const ISS_START As String = "<<<ISSUES>>>"
Private Const ISS_END   As String = "<<<ISSUES_END>>>"

' ---- Custom type for conflict checking (must be at module level) -----------
Private Type CourseEntry
    rowNum     As Long
    crn        As String
    courseCode As String
    title      As String
    room       As String
    days       As String
    startTime  As String
    endTime    As String
    instructor As String
    enrollment As Long
    startMin   As Long
    endMin     As Long
End Type

'=============================================================================
' 1.  WORKBOOK SETUP
'=============================================================================

Public Sub SetupWorkbook()
    Application.ScreenUpdating = False
    Application.DisplayAlerts = False

    Dim wb As Workbook: Set wb = ThisWorkbook
    BuildDashboard wb
    BuildCoursesSheet wb
    BuildRoomsSheet wb
    BuildConstraintsSheet wb
    BuildScheduleSheet wb
    BuildSettingsSheet wb

    Dim order As Variant
    order = Array("Dashboard", "Courses", "Rooms", "Constraints", "Schedule", "Settings")
    Dim i As Integer
    For i = 0 To UBound(order)
        On Error Resume Next
        wb.Sheets(order(i)).Move Before:=wb.Sheets(i + 1)
        On Error GoTo 0
    Next i

    wb.Sheets("Dashboard").Activate
    Application.DisplayAlerts = True
    Application.ScreenUpdating = True

    MsgBox "Workbook ready! Start with Step 1 on the Dashboard.", vbInformation, "Setup Complete"
End Sub

Private Sub BuildDashboard(wb As Workbook)
    Dim ws As Worksheet: Set ws = SheetGetOrCreate(wb, "Dashboard")
    ws.Cells.Clear

    ' Title
    With ws.Range("B2")
        .Value = "Mason School of Business  |  AI Schedule Builder"
        .Font.Size = 18: .Font.Bold = True: .Font.Color = RGB(0, 51, 102)
    End With
    With ws.Range("B3")
        .Value = "Agentic AI Scheduling Workflow  |  Fall 2026 Undergraduate"
        .Font.Size = 11: .Font.Color = RGB(100, 100, 100)
    End With

    ' Workflow steps
    ws.Range("B5").Value = "WORKFLOW  (follow these steps in order)"
    ws.Range("B5").Font.Bold = True: ws.Range("B5").Font.Size = 11

    Dim steps As Variant
    steps = Array( _
        "Step 1  Import Enrollment Data   Load course sections from the enrollment Excel file.", _
        "Step 2  Copy Prompt to Clipboard  Send your course data to Claude (free, claude.ai).", _
        "Step 3  Import Claude's Response  Paste Claude's reply and write the schedule.", _
        "Step 4  Check for Conflicts       Scan for room, instructor, and capacity problems.", _
        "Step 5  Adjust & Re-Check         Fix flagged issues and re-run Check Conflicts." _
    )
    Dim s As Integer
    For s = 0 To UBound(steps)
        With ws.Range("B" & (6 + s))
            .Value = steps(s)
            .Font.Size = 11
        End With
    Next s

    ws.Range("B12").Value = "NOTES"
    ws.Range("B12").Font.Bold = True: ws.Range("B12").Font.Size = 11
    ws.Range("B13").Value = "Steps 2 and 3 are FREE  no API key needed.  Just a free claude.ai account."
    ws.Range("B13").Font.Color = RGB(0, 128, 0)
    ws.Range("B14").Value = "The Generate with AI button automates Steps 2-3 but requires an Anthropic API key (~$0.10/run)."
    ws.Range("B14").Font.Color = RGB(100, 100, 100)

    ws.Range("B16").Value = "COLOR KEY"
    ws.Range("B16").Font.Bold = True: ws.Range("B16").Font.Size = 11
    LegendCell ws, "B17", "Core",         RGB(220, 230, 241)
    LegendCell ws, "B18", "Required",     RGB(226, 239, 218)
    LegendCell ws, "B19", "Elective",     RGB(255, 242, 204)
    LegendCell ws, "B20", "Prerequisite", RGB(242, 220, 219)
    LegendCell ws, "B21", "Conflict",     RGB(255, 199, 206)

    ' Button column
    Dim bLeft As Single: bLeft = ws.Cells(1, 5).Left
    Dim bW    As Single: bW    = 230

    PlaceButton ws, "Step 1  Import Enrollment Data",    "ImportEnrollmentData",    bLeft, RowTop(ws, 6),  bW, RowH(ws, 6)
    PlaceButton ws, "Step 2  Copy Prompt to Clipboard",  "CopyPromptToClipboard",   bLeft, RowTop(ws, 7),  bW, RowH(ws, 7)
    PlaceButton ws, "Step 3  Import Claude's Response",  "ImportClaudeResponse",    bLeft, RowTop(ws, 8),  bW, RowH(ws, 8)
    PlaceButton ws, "Step 4  Check for Conflicts",       "CheckConflicts",          bLeft, RowTop(ws, 9),  bW, RowH(ws, 9)
    PlaceButton ws, "Generate with AI (API Key)",        "GenerateWithAI",          bLeft, RowTop(ws, 14), bW, RowH(ws, 14)
    PlaceButton ws, "Clear Schedule",                    "ClearSchedule",           bLeft, RowTop(ws, 21), 120, RowH(ws, 21)

    ws.Columns("A").ColumnWidth = 2
    ws.Columns("B").ColumnWidth = 75
    ws.Tab.Color = RGB(0, 51, 102)
End Sub

Private Sub LegendCell(ws As Worksheet, addr As String, label As String, bg As Long)
    With ws.Range(addr)
        .Value = "   " & label
        .Interior.Color = bg
        .Font.Size = 10
    End With
End Sub

Private Function RowTop(ws As Worksheet, r As Long) As Single
    RowTop = ws.Rows(r).Top + 1
End Function
Private Function RowH(ws As Worksheet, r As Long) As Single
    RowH = ws.Rows(r).Height - 2
End Function

Private Sub PlaceButton(ws As Worksheet, caption As String, macro As String, _
                        lft As Single, tp As Single, w As Single, h As Single)
    Dim btn As Button
    Set btn = ws.Buttons.Add(lft, tp, w, h)
    btn.Caption = caption
    btn.OnAction = macro
    btn.Font.Size = 10
    btn.Font.Bold = True
End Sub

Private Sub BuildCoursesSheet(wb As Workbook)
    Dim ws As Worksheet: Set ws = SheetGetOrCreate(wb, "Courses")
    If ws.Range("A1").Value <> "" Then GoTo Tab
    ws.Cells.Clear
    Dim h As Variant
    h = Array("CRN", "Course Code", "Title", "Section", "Enrollment", "Max Capacity", _
              "Credits", "Type", "Days", "Timeslot", "Room", "Instructor", "Notes")
    HeaderRow ws, 1, h
    Dim ex As Variant
    ex = Array("12345", "BUAD 301-01", "Financial Accounting", "01", "45", "60", _
               "3", "Core", "MW", "9:00 AM - 10:15 AM", "1082", "Smith, John", "EXAMPLE - replace")
    Dim c As Integer
    For c = 0 To UBound(ex)
        ws.Cells(2, c + 1).Value = ex(c)
        ws.Cells(2, c + 1).Font.Italic = True
        ws.Cells(2, c + 1).Font.Color = RGB(160, 160, 160)
    Next c
    ws.Columns("A").ColumnWidth = 10:  ws.Columns("B").ColumnWidth = 16
    ws.Columns("C").ColumnWidth = 38:  ws.Columns("D").ColumnWidth = 10
    ws.Columns("E").ColumnWidth = 13:  ws.Columns("F").ColumnWidth = 15
    ws.Columns("G").ColumnWidth = 10:  ws.Columns("H").ColumnWidth = 14
    ws.Columns("I").ColumnWidth = 10:  ws.Columns("J").ColumnWidth = 22
    ws.Columns("K").ColumnWidth = 12:  ws.Columns("L").ColumnWidth = 22
    ws.Columns("M").ColumnWidth = 35
    FreezeAt ws, "A2"
Tab:
    ws.Tab.Color = RGB(0, 112, 192)
End Sub

Private Sub BuildRoomsSheet(wb As Workbook)
    Dim ws As Worksheet: Set ws = SheetGetOrCreate(wb, "Rooms")
    If ws.Range("A1").Value <> "" Then GoTo Tab
    ws.Cells.Clear
    HeaderRow ws, 1, Array("Room", "Building", "Capacity", "Room Type", "Notes / Special Features")
    Dim rooms As Variant
    rooms = Array( _
        Array("1005", "Miller Hall", 120, "Flat", ""), _
        Array("1008", "Miller Hall", 32, "Design Lab", "Design studio layout - specialized"), _
        Array("1013", "Miller Hall", 50, "Flat", ""), _
        Array("1018", "Miller Hall", 50, "Flat", ""), _
        Array("1019", "Miller Hall", 46, "Finance/Markets Lab", "Bloomberg terminals - specialized"), _
        Array("1027", "Miller Hall", 50, "Flat", ""), _
        Array("1066", "Miller Hall", 24, "Seminar", "Seminar/conference layout"), _
        Array("1069", "Miller Hall", 48, "Flat", ""), _
        Array("1077", "Miller Hall", 45, "Cluster", "Cluster/pod seating"), _
        Array("1078", "Miller Hall", 50, "Flat", ""), _
        Array("1082", "Miller Hall", 60, "Tiered", "Tiered lecture hall"), _
        Array("1088", "Miller Hall", 60, "Tiered", "Tiered lecture hall"), _
        Array("1090", "Miller Hall", 50, "Flat", ""), _
        Array("2003", "Miller Hall", 50, "Flat", ""), _
        Array("2052", "Miller Hall", 50, "Flat", ""), _
        Array("ISC 1127", "Integrated Science Center", 180, "Large Lecture", "Large lecture hall") _
    )
    Dim r As Integer
    For r = 0 To UBound(rooms)
        Dim col As Integer
        For col = 0 To 4: ws.Cells(r + 2, col + 1).Value = rooms(r)(col): Next col
    Next r
    ws.Columns("A").ColumnWidth = 14:  ws.Columns("B").ColumnWidth = 26
    ws.Columns("C").ColumnWidth = 12:  ws.Columns("D").ColumnWidth = 20
    ws.Columns("E").ColumnWidth = 45
    FreezeAt ws, "A2"
Tab:
    ws.Tab.Color = RGB(70, 130, 180)
End Sub

Private Sub BuildConstraintsSheet(wb As Workbook)
    Dim ws As Worksheet: Set ws = SheetGetOrCreate(wb, "Constraints")
    If ws.Range("A1").Value <> "" Then GoTo Tab
    ws.Cells.Clear
    ws.Range("A1").Value = "Scheduling Constraints  (Optional)"
    ws.Range("A1").Font.Bold = True: ws.Range("A1").Font.Size = 13: ws.Range("A1").Font.Color = RGB(0, 51, 102)
    ws.Range("A2").Value = "Real constraints go below row 4. Grey italic rows are examples - delete or ignore them."
    ws.Range("A2").Font.Italic = True: ws.Range("A2").Font.Color = RGB(160, 160, 160)
    HeaderRow ws, 4, Array("Type", "Description")
    Dim ex As Variant
    ex = Array( _
        Array("Room", "Room 1008 (Design Lab) should only be used for design/experiential courses"), _
        Array("Room", "Room 1019 (Finance Lab) should only be used for finance/markets courses"), _
        Array("Instructor", "Prof. Smith is not available MWF before 10 AM"), _
        Array("General", "No classes on Friday afternoons after 3:30 PM if possible"), _
        Array("General", "Core courses should be in rooms with capacity 45 or more") _
    )
    Dim i As Integer
    For i = 0 To UBound(ex)
        ws.Cells(i + 5, 1).Value = ex(i)(0): ws.Cells(i + 5, 2).Value = ex(i)(1)
        ws.Cells(i + 5, 1).Font.Italic = True: ws.Cells(i + 5, 2).Font.Italic = True
        ws.Cells(i + 5, 1).Font.Color = RGB(160, 160, 160): ws.Cells(i + 5, 2).Font.Color = RGB(160, 160, 160)
    Next i
    ws.Columns("A").ColumnWidth = 16: ws.Columns("B").ColumnWidth = 80
Tab:
    ws.Tab.Color = RGB(255, 165, 0)
End Sub

Private Sub BuildScheduleSheet(wb As Workbook)
    Dim ws As Worksheet: Set ws = SheetGetOrCreate(wb, "Schedule")
    ws.Cells.Clear
    ws.Range("A1").Value = "Generated Schedule  -  Mason School of Business, Fall 2026"
    ws.Range("A1").Font.Bold = True: ws.Range("A1").Font.Size = 14: ws.Range("A1").Font.Color = RGB(0, 51, 102)
    ws.Range("A2").Value = "Not yet generated."
    ws.Range("A2").Font.Italic = True: ws.Range("A2").Font.Color = RGB(160, 160, 160)
    HeaderRow ws, 4, Array("CRN", "Course Code", "Title", "Enrollment", "Type", _
                            "Room", "Days", "Start Time", "End Time", "Instructor", "Issues / Notes")
    ws.Columns("A").ColumnWidth = 10:  ws.Columns("B").ColumnWidth = 16
    ws.Columns("C").ColumnWidth = 38:  ws.Columns("D").ColumnWidth = 12
    ws.Columns("E").ColumnWidth = 14:  ws.Columns("F").ColumnWidth = 14
    ws.Columns("G").ColumnWidth = 10:  ws.Columns("H").ColumnWidth = 14
    ws.Columns("I").ColumnWidth = 14:  ws.Columns("J").ColumnWidth = 22
    ws.Columns("K").ColumnWidth = 55
    FreezeAt ws, "A5"
    ws.Tab.Color = RGB(0, 176, 80)
End Sub

Private Sub BuildSettingsSheet(wb As Workbook)
    Dim ws As Worksheet: Set ws = SheetGetOrCreate(wb, "Settings")
    If ws.Range("A1").Value <> "" Then GoTo Hide
    ws.Cells.Clear
    ws.Range("A1").Value = "Settings  (Do not delete or rename this sheet)"
    ws.Range("A1").Font.Bold = True: ws.Range("A1").Font.Color = RGB(150, 0, 0)
    ws.Range("A3").Value = "Anthropic API Key (optional - only needed for automated mode)"
    ws.Range("A3").Font.Bold = True
    ws.Range("B3").Value = ""
    ws.Range("A5").Value = "How to get an API key:"
    ws.Range("A6").Value = "  1. Go to console.anthropic.com and sign in."
    ws.Range("A7").Value = "  2. Click API Keys > Create Key."
    ws.Range("A8").Value = "  3. Copy the key (starts with sk-ant-) and paste it in B3."
    ws.Range("A9").Value = "  Cost: ~$0.05-$0.15 per generation. Not required for the free clipboard workflow."
    ws.Range("A9").Font.Italic = True: ws.Range("A9").Font.Color = RGB(100, 100, 100)
    ws.Columns("A").ColumnWidth = 60: ws.Columns("B").ColumnWidth = 70
Hide:
    ws.Visible = xlSheetVeryHidden
    ws.Tab.Color = RGB(150, 150, 150)
End Sub

Private Sub HeaderRow(ws As Worksheet, rowNum As Long, headers As Variant)
    Dim c As Integer
    For c = 0 To UBound(headers)
        With ws.Cells(rowNum, c + 1)
            .Value = headers(c)
            .Font.Bold = True
            .Font.Color = RGB(255, 255, 255)
            .Interior.Color = RGB(0, 51, 102)
            .HorizontalAlignment = xlCenter
        End With
    Next c
    ws.Rows(rowNum).RowHeight = 18
End Sub

Private Function SheetGetOrCreate(wb As Workbook, sName As String) As Worksheet
    Dim ws As Worksheet
    On Error Resume Next: Set ws = wb.Sheets(sName): On Error GoTo 0
    If ws Is Nothing Then
        Set ws = wb.Sheets.Add(After:=wb.Sheets(wb.Sheets.Count))
        ws.Name = sName
    End If
    Set SheetGetOrCreate = ws
End Function

Private Sub FreezeAt(ws As Worksheet, addr As String)
    ws.Activate
    ActiveWindow.FreezePanes = False
    ws.Range(addr).Select
    ActiveWindow.FreezePanes = True
End Sub

'=============================================================================
' 2.  STEP 1 - IMPORT ENROLLMENT DATA
'=============================================================================

Public Sub ImportEnrollmentData()
    Dim filePath As String
    filePath = Application.GetOpenFilename( _
        "Excel Files (*.xlsx;*.xlsm;*.xls),*.xlsx;*.xlsm;*.xls", _
        1, "Select the UG Enrollment and Schedule Excel file")

    If filePath = "False" Or filePath = "" Then Exit Sub

    If MsgBox("Import courses from:" & vbNewLine & filePath & vbNewLine & vbNewLine & _
              "This will REPLACE the current Courses sheet data. Continue?", _
              vbYesNo + vbQuestion, "Confirm Import") = vbNo Then Exit Sub

    Application.ScreenUpdating = False
    Application.StatusBar = "Opening enrollment file..."

    Dim srcWb As Workbook
    On Error Resume Next
    Set srcWb = Workbooks.Open(Filename:=filePath, ReadOnly:=True, UpdateLinks:=False)
    On Error GoTo 0

    If srcWb Is Nothing Then
        Application.StatusBar = False
        Application.ScreenUpdating = True
        MsgBox "Could not open the file. Make sure it is not open in another program.", vbExclamation
        Exit Sub
    End If

    ' Find the right sheet (prefer one with "schedule" or "enroll" in the name)
    Dim srcWs As Worksheet
    Dim sh As Worksheet
    For Each sh In srcWb.Sheets
        If InStr(LCase(sh.Name), "schedule") > 0 Or InStr(LCase(sh.Name), "enroll") > 0 Then
            Set srcWs = sh: Exit For
        End If
    Next sh
    If srcWs Is Nothing Then Set srcWs = srcWb.Sheets(1)

    ' Find the header row (scan first 10 rows for "CRN" or "Subject")
    Dim hdrRow As Long: hdrRow = FindHeaderRow(srcWs)
    If hdrRow = 0 Then
        srcWb.Close False
        Application.StatusBar = False
        Application.ScreenUpdating = True
        MsgBox "Could not find a header row in the selected file.", vbExclamation
        Exit Sub
    End If

    ' Map header names to column indices
    Dim colMap As Object: Set colMap = CreateObject("Scripting.Dictionary")
    Dim lastHdrCol As Long
    lastHdrCol = srcWs.Cells(hdrRow, srcWs.Columns.Count).End(xlToLeft).Column
    Dim c As Long
    For c = 1 To lastHdrCol
        colMap(LCase(Trim(CStr(srcWs.Cells(hdrRow, c).Value)))) = c
    Next c

    ' Clear Courses sheet data rows (keep header)
    Dim wsC As Worksheet: Set wsC = ThisWorkbook.Sheets("Courses")
    Dim lastUsed As Long: lastUsed = wsC.Cells(wsC.Rows.Count, 1).End(xlUp).Row
    If lastUsed > 1 Then
        wsC.Range("A2:M" & lastUsed).ClearContents
        wsC.Range("A2:M" & lastUsed).Font.Italic = False
        wsC.Range("A2:M" & lastUsed).Font.Color = RGB(0, 0, 0)
    End If

    Dim outRow As Long: outRow = 2
    Dim imported As Long: imported = 0
    Dim lastDataRow As Long: lastDataRow = srcWs.Cells(srcWs.Rows.Count, 1).End(xlUp).Row

    Application.StatusBar = "Importing courses..."

    Dim r As Long
    For r = hdrRow + 1 To lastDataRow
        Dim crnVal As String
        crnVal = Trim(CStr(srcWs.Cells(r, ColIdx(colMap, "crn", 7)).Value))
        If crnVal = "" Or crnVal = "0" Then GoTo NextRow

        ' Build course code
        Dim subj   As String: subj   = Trim(CStr(srcWs.Cells(r, ColIdx(colMap, "subject", 8)).Value))
        Dim crsNo  As String: crsNo  = Trim(CStr(srcWs.Cells(r, ColIdx(colMap, "course no", 9)).Value))
        Dim secNo  As String: secNo  = Trim(CStr(srcWs.Cells(r, ColIdx(colMap, "section no", 10)).Value))
        Dim code   As String: code   = subj & " " & crsNo & "-" & secNo

        ' Instructor
        Dim iLast     As String: iLast     = Trim(CStr(srcWs.Cells(r, ColIdx(colMap, "instr last", 22)).Value))
        Dim iFirst    As String: iFirst    = Trim(CStr(srcWs.Cells(r, ColIdx(colMap, "instr first", 23)).Value))
        Dim instrName As String
        If iLast <> "" And iFirst <> "" Then
            instrName = iLast & ", " & iFirst
        Else
            instrName = iLast & iFirst
        End If

        ' Enrollment - try "adj. enrl" first, then "enrl", then "adj enrl"
        Dim enrlVal As String
        enrlVal = Trim(CStr(srcWs.Cells(r, ColIdx(colMap, "adj. enrl", -1)).Value))
        If enrlVal = "" Or enrlVal = "0" Then enrlVal = Trim(CStr(srcWs.Cells(r, ColIdx(colMap, "enrl", 13)).Value))

        ' Write row
        wsC.Cells(outRow, 1).Value  = crnVal
        wsC.Cells(outRow, 2).Value  = code
        wsC.Cells(outRow, 3).Value  = Trim(CStr(srcWs.Cells(r, ColIdx(colMap, "title", 11)).Value))
        wsC.Cells(outRow, 4).Value  = secNo
        wsC.Cells(outRow, 5).Value  = enrlVal
        wsC.Cells(outRow, 6).Value  = Trim(CStr(srcWs.Cells(r, ColIdx(colMap, "max", 12)).Value))
        wsC.Cells(outRow, 7).Value  = Trim(CStr(srcWs.Cells(r, ColIdx(colMap, "cred", 16)).Value))
        wsC.Cells(outRow, 8).Value  = Trim(CStr(srcWs.Cells(r, ColIdx(colMap, "crse type", 15)).Value))
        wsC.Cells(outRow, 9).Value  = Trim(CStr(srcWs.Cells(r, ColIdx(colMap, "days 1", 17)).Value))
        wsC.Cells(outRow, 10).Value = Trim(CStr(srcWs.Cells(r, ColIdx(colMap, "timeslot 1", 18)).Value))
        wsC.Cells(outRow, 11).Value = Trim(CStr(srcWs.Cells(r, ColIdx(colMap, "room", 21)).Value))
        wsC.Cells(outRow, 12).Value = instrName
        wsC.Cells(outRow, 13).Value = ""

        outRow = outRow + 1
        imported = imported + 1
        NextRow:
    Next r

    srcWb.Close False
    Application.StatusBar = False
    Application.ScreenUpdating = True
    wsC.Activate

    MsgBox imported & " course sections imported!" & vbNewLine & vbNewLine & _
           "Next: Click  Step 2 - Copy Prompt to Clipboard  on the Dashboard," & vbNewLine & _
           "then paste into claude.ai to generate the schedule.", _
           vbInformation, "Step 1 Complete"
End Sub

Private Function FindHeaderRow(ws As Worksheet) As Long
    Dim r As Long, c As Long, v As String
    For r = 1 To 10
        For c = 1 To 30
            v = LCase(Trim(CStr(ws.Cells(r, c).Value)))
            If v = "crn" Or v = "subject" Or v = "course no" Then
                FindHeaderRow = r: Exit Function
            End If
        Next c
    Next r
    FindHeaderRow = 0
End Function

Private Function ColIdx(colMap As Object, key As String, defaultCol As Long) As Long
    If colMap.Exists(LCase(key)) Then
        ColIdx = colMap(LCase(key))
    Else
        ColIdx = defaultCol
    End If
End Function

'=============================================================================
' 3.  STEP 2 - COPY PROMPT TO CLIPBOARD  (free, no API key needed)
'=============================================================================

Public Sub CopyPromptToClipboard()
    Dim prompt As String: prompt = BuildPrompt()
    If prompt = "" Then Exit Sub

    Dim obj As Object
    Set obj = CreateObject("new:{1C3B4210-F441-11CE-B9EA-00AA006B1A69}")
    obj.SetText prompt
    obj.PutInClipboard

    MsgBox "Prompt copied!" & vbNewLine & vbNewLine & _
           "Now:" & vbNewLine & _
           "  1. Open claude.ai in your browser  (free account is fine)" & vbNewLine & _
           "  2. Start a new conversation" & vbNewLine & _
           "  3. Paste (Ctrl+V) and press Enter" & vbNewLine & _
           "  4. Wait for Claude to respond (may take 30-60 seconds)" & vbNewLine & _
           "  5. Click the copy icon on Claude's response" & vbNewLine & _
           "  6. Come back here and click  Step 3 - Import Claude's Response", _
           vbInformation, "Step 2 - Prompt Copied"
End Sub

'=============================================================================
' 4.  STEP 3 - IMPORT CLAUDE'S RESPONSE
'=============================================================================

Public Sub ImportClaudeResponse()
    ' Just open the paste sheet - user pastes freely, then clicks the button on the sheet
    Dim pasteWs As Worksheet: Set pasteWs = GetOrCreatePasteSheet()
    pasteWs.Visible = xlSheetVisible
    pasteWs.Activate
    pasteWs.Range("B5").Select
End Sub

Public Sub FinishImport()
    ' Called by the "Done Pasting" button on the PasteHere sheet
    Dim pasteWs As Worksheet: Set pasteWs = ThisWorkbook.Sheets("PasteHere")
    Dim pastedText As String: pastedText = Trim(CStr(pasteWs.Range("B5").Value))

    pasteWs.Visible = xlSheetVeryHidden

    If Len(pastedText) = 0 Then
        MsgBox "Nothing was pasted. Please try Step 3 again.", vbExclamation, "Nothing Pasted"
        Exit Sub
    End If

    Dim schedText As String: schedText = Between(pastedText, SCH_START, SCH_END)
    If Len(Trim(schedText)) = 0 Then
        If InStr(pastedText, "|") > 0 Then
            schedText = pastedText
        Else
            MsgBox "Could not find the schedule block." & vbNewLine & vbNewLine & _
                   "Make sure Claude's response includes the " & SCH_START & " marker." & vbNewLine & _
                   "If not, ask Claude: 'Please reformat using the markers I specified.'", _
                   vbExclamation, "Parse Error"
            Exit Sub
        End If
    End If

    WriteSchedule schedText

    Dim issText As String: issText = Between(pastedText, ISS_START, ISS_END)
    Dim msg As String: msg = "Schedule imported! Running conflict check..."
    If Len(Trim(issText)) > 0 And LCase(Trim(issText)) <> "none" Then
        msg = msg & vbNewLine & vbNewLine & "Issues Claude flagged:" & vbNewLine & issText
    End If
    MsgBox msg, vbInformation, "Step 3 Complete"

    ThisWorkbook.Sheets("Schedule").Activate
    CheckConflicts
End Sub

Private Function GetOrCreatePasteSheet() As Worksheet
    Dim ws As Worksheet
    On Error Resume Next: Set ws = ThisWorkbook.Sheets("PasteHere"): On Error GoTo 0

    If ws Is Nothing Then
        Set ws = ThisWorkbook.Sheets.Add(After:=ThisWorkbook.Sheets(ThisWorkbook.Sheets.Count))
        ws.Name = "PasteHere"
        ws.Range("A1").Value = "Step 3  Paste Claude's Response Here"
        ws.Range("A1").Font.Bold = True: ws.Range("A1").Font.Size = 13: ws.Range("A1").Font.Color = RGB(0, 51, 102)
        ws.Range("A3").Value = "Instructions:"
        ws.Range("A3").Font.Bold = True
        ws.Range("A4").Value = "1. In claude.ai, click the copy icon on Claude's message"
        ws.Range("A5").Value = "2. Click the yellow cell (B5) below"
        ws.Range("A6").Value = "3. Press Ctrl+V to paste"
        ws.Range("A7").Value = "4. Click OK on the dialog box that appeared earlier"
        With ws.Range("B5")
            .Value = ""
            .Interior.Color = RGB(255, 255, 153)
            .Borders.LineStyle = xlContinuous
            .Borders.Color = RGB(180, 140, 0)
            .WrapText = True
            .VerticalAlignment = xlTop
        End With
        ws.Rows(5).RowHeight = 300
        ws.Columns("A").ColumnWidth = 40
        ws.Columns("B").ColumnWidth = 100
        ws.Tab.Color = RGB(255, 200, 0)

        ' Add "Done" button so user never needs to click a dialog
        Dim btn As Button
        Set btn = ws.Buttons.Add(ws.Cells(1, 4).Left, ws.Rows(2).Top, 200, 24)
        btn.Caption = "Done Pasting  -  Import Now"
        btn.OnAction = "FinishImport"
        btn.Font.Bold = True
        btn.Font.Size = 11
    End If

    ' Ensure button exists (in case sheet was created by an older version)
    If ws.Buttons.Count = 0 Then
        Dim btn2 As Button
        Set btn2 = ws.Buttons.Add(ws.Cells(1, 4).Left, ws.Rows(2).Top, 200, 24)
        btn2.Caption = "Done Pasting  -  Import Now"
        btn2.OnAction = "FinishImport"
        btn2.Font.Bold = True
        btn2.Font.Size = 11
    End If

    ws.Range("B5").Value = ""  ' clear previous paste
    Set GetOrCreatePasteSheet = ws
End Function

'=============================================================================
' 5.  STEP 4 - CHECK FOR CONFLICTS
'=============================================================================

Public Sub CheckConflicts()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets("Schedule")
    Dim lastRow As Long: lastRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row

    If lastRow < 5 Then
        MsgBox "No schedule data found. Complete Steps 1-3 first.", vbInformation, "No Data"
        Exit Sub
    End If

    Application.ScreenUpdating = False
    Application.StatusBar = "Checking for conflicts..."

    ' Load all course rows into array
    Dim entries() As CourseEntry
    Dim total As Long: total = 0
    Dim r As Long
    For r = 5 To lastRow
        If Trim(CStr(ws.Cells(r, 1).Value)) <> "" Then total = total + 1
    Next r

    If total = 0 Then
        Application.StatusBar = False
        Application.ScreenUpdating = True
        MsgBox "No course data found on the Schedule sheet.", vbInformation
        Exit Sub
    End If

    ReDim entries(1 To total)
    Dim idx As Long: idx = 1
    For r = 5 To lastRow
        If Trim(CStr(ws.Cells(r, 1).Value)) <> "" Then
            With entries(idx)
                .rowNum     = r
                .crn        = Trim(CStr(ws.Cells(r, 1).Value))
                .courseCode = Trim(CStr(ws.Cells(r, 2).Value))
                .title      = Trim(CStr(ws.Cells(r, 3).Value))
                .enrollment = SafeLng(ws.Cells(r, 4).Value)
                .room       = Trim(CStr(ws.Cells(r, 6).Value))
                .days       = Trim(CStr(ws.Cells(r, 7).Value))
                .startTime  = Trim(CStr(ws.Cells(r, 8).Value))
                .endTime    = Trim(CStr(ws.Cells(r, 9).Value))
                .instructor = Trim(CStr(ws.Cells(r, 10).Value))
                .startMin   = TimeToMinutes(.startTime)
                .endMin     = TimeToMinutes(.endTime)
            End With
            idx = idx + 1
        End If
    Next r

    ' Compare every pair
    Dim notes() As String: ReDim notes(1 To total)
    Dim i As Long, j As Long
    For i = 1 To total
        Dim n As String: n = ""
        For j = 1 To total
            If i = j Then GoTo SkipJ

            ' Room conflict
            If entries(i).room <> "" And entries(j).room <> "" Then
                If LCase(entries(i).room) = LCase(entries(j).room) And _
                   DaysOverlap(entries(i).days, entries(j).days) And _
                   TimesOverlap(entries(i).startMin, entries(i).endMin, _
                                entries(j).startMin, entries(j).endMin) Then
                    n = n & "ROOM CONFLICT with " & entries(j).courseCode & "  "
                End If
            End If

            ' Instructor conflict
            If entries(i).instructor <> "" And entries(j).instructor <> "" Then
                If LCase(entries(i).instructor) = LCase(entries(j).instructor) And _
                   DaysOverlap(entries(i).days, entries(j).days) And _
                   TimesOverlap(entries(i).startMin, entries(i).endMin, _
                                entries(j).startMin, entries(j).endMin) Then
                    n = n & "INSTRUCTOR CONFLICT with " & entries(j).courseCode & "  "
                End If
            End If
            SkipJ:
        Next j

        ' Capacity check
        Dim cap As Long: cap = RoomCapacity(entries(i).room)
        If cap > 0 And entries(i).enrollment > cap Then
            n = n & "OVER CAPACITY: " & entries(i).enrollment & " students, room holds " & cap & "  "
        End If

        ' Special room check
        Dim sNote As String: sNote = SpecialRoomCheck(entries(i).room, entries(i).courseCode)
        If sNote <> "" Then n = n & sNote

        notes(i) = Trim(n)
    Next i

    ' Write results to sheet
    Dim conflictCount As Long: conflictCount = 0
    For i = 1 To total
        Dim issCell As Range: Set issCell = ws.Cells(entries(i).rowNum, 11)
        Dim existing As String: existing = CleanAutoNotes(Trim(CStr(issCell.Value)))

        If notes(i) <> "" Then
            issCell.Value = IIf(existing <> "", notes(i) & " | " & existing, notes(i))
            issCell.Interior.Color = RGB(255, 199, 206)
            issCell.Font.Color = RGB(156, 0, 6)
            conflictCount = conflictCount + 1
        Else
            issCell.Value = existing
            If existing = "" Then
                issCell.Interior.ColorIndex = xlNone
                issCell.Font.Color = RGB(0, 0, 0)
            End If
        End If
    Next i

    Application.StatusBar = False
    Application.ScreenUpdating = True

    If conflictCount = 0 Then
        MsgBox "No conflicts found! The schedule looks clean." & vbNewLine & vbNewLine & _
               "The schedule is ready to use.", vbInformation, "All Clear"
    Else
        MsgBox conflictCount & " row(s) have conflicts, highlighted in red." & vbNewLine & vbNewLine & _
               "Review column K (Issues / Notes) on the Schedule sheet." & vbNewLine & _
               "Fix the assignments, then run Check Conflicts again.", _
               vbExclamation, "Conflicts Found"
        ThisWorkbook.Sheets("Schedule").Activate
    End If
End Sub

' ---- Conflict helper functions ---------------------------------------------

Private Function TimeToMinutes(t As String) As Long
    If t = "" Then TimeToMinutes = 0: Exit Function
    ' Handle range like "9:30 AM - 10:45 AM" - take start only
    If InStr(t, " - ") > 0 Then t = Trim(Split(t, " - ")(0))
    ' Detect AM/PM
    Dim isPM As Boolean: isPM = (InStr(UCase(t), "PM") > 0)
    Dim isAM As Boolean: isAM = (InStr(UCase(t), "AM") > 0)
    t = Trim(Replace(Replace(Replace(UCase(t), "PM", ""), "AM", ""), " ", ""))
    Dim h As Long, m As Long
    If InStr(t, ":") > 0 Then
        h = CLng(Split(t, ":")(0))
        m = CLng(Left(Split(t, ":")(1), 2))
    ElseIf Len(t) = 4 Then
        h = CLng(Left(t, 2)): m = CLng(Right(t, 2))
    ElseIf Len(t) <= 2 Then
        h = CLng(t): m = 0
    Else
        TimeToMinutes = 0: Exit Function
    End If
    If isPM And h <> 12 Then h = h + 12
    If isAM And h = 12 Then h = 0
    TimeToMinutes = h * 60 + m
End Function

Private Function TimesOverlap(s1 As Long, e1 As Long, s2 As Long, e2 As Long) As Boolean
    If s1 = 0 Or e1 = 0 Or s2 = 0 Or e2 = 0 Then TimesOverlap = False: Exit Function
    TimesOverlap = (s1 < e2) And (s2 < e1)
End Function

Private Function DaysOverlap(d1 As String, d2 As String) As Boolean
    If d1 = "" Or d2 = "" Then DaysOverlap = False: Exit Function
    d1 = Replace(UCase(d1), " ", ""): d2 = Replace(UCase(d2), " ", "")
    Dim day As Variant
    For Each day In Array("M", "T", "W", "R", "F", "S")
        If InStr(d1, CStr(day)) > 0 And InStr(d2, CStr(day)) > 0 Then
            DaysOverlap = True: Exit Function
        End If
    Next day
    DaysOverlap = False
End Function

Private Function RoomCapacity(room As String) As Long
    Dim ws As Worksheet
    On Error Resume Next: Set ws = ThisWorkbook.Sheets("Rooms"): On Error GoTo 0
    If ws Is Nothing Then RoomCapacity = 0: Exit Function
    Dim r As Long
    For r = 2 To ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
        If LCase(Trim(CStr(ws.Cells(r, 1).Value))) = LCase(Trim(room)) Then
            RoomCapacity = SafeLng(ws.Cells(r, 3).Value): Exit Function
        End If
    Next r
    RoomCapacity = 0
End Function

Private Function SpecialRoomCheck(room As String, code As String) As String
    Dim r As String: r = LCase(Trim(room))
    Dim c As String: c = LCase(code)
    If r = "1019" Then
        If InStr(c, "fin") = 0 And InStr(c, "mktg") = 0 And InStr(c, "market") = 0 Then
            SpecialRoomCheck = "Finance Lab (1019) may be wrong for this course.  "
        End If
    End If
    If r = "1008" Then
        If InStr(c, "des") = 0 And InStr(c, "exp") = 0 And InStr(c, "entr") = 0 Then
            SpecialRoomCheck = "Design Lab (1008) may be wrong for this course.  "
        End If
    End If
End Function

Private Function CleanAutoNotes(s As String) As String
    ' Strip auto-generated conflict lines, keep human notes
    Dim parts() As String: parts = Split(s, "|")
    Dim result As String: result = ""
    Dim p As Variant
    For Each p In parts
        Dim part As String: part = Trim(CStr(p))
        If InStr(part, "CONFLICT") = 0 And InStr(part, "CAPACITY") = 0 And _
           InStr(part, "Lab (") = 0 Then
            If result <> "" And part <> "" Then result = result & " | "
            If part <> "" Then result = result & part
        End If
    Next p
    CleanAutoNotes = Trim(result)
End Function

Private Function SafeLng(v As Variant) As Long
    On Error Resume Next: SafeLng = CLng(v): On Error GoTo 0
End Function

'=============================================================================
' 6.  STEP 2 ALTERNATE - GENERATE WITH AI  (automated, API key required)
'=============================================================================

Public Sub GenerateWithAI()
    Dim apiKey As String: apiKey = ReadAPIKey()
    If Len(Trim(apiKey)) = 0 Then
        If MsgBox("No API key found." & vbNewLine & vbNewLine & _
                  "Enter your key now? (or use the free clipboard option instead)", _
                  vbYesNo + vbQuestion, "API Key Required") = vbYes Then
            OpenSettings: apiKey = ReadAPIKey()
        End If
        If Len(Trim(apiKey)) = 0 Then Exit Sub
    End If
    Dim prompt As String: prompt = BuildPrompt()
    If prompt = "" Then Exit Sub
    Application.StatusBar = "Calling Claude API (30-90 seconds)..."
    Application.ScreenUpdating = False
    Dim resp As String: resp = CallClaude(prompt, apiKey)
    Application.StatusBar = False
    Application.ScreenUpdating = True
    If Left(resp, 7) = "ERROR: " Then
        MsgBox "API error:" & vbNewLine & resp, vbCritical, "Error": Exit Sub
    End If
    Dim schedText As String: schedText = Between(resp, SCH_START, SCH_END)
    If Len(Trim(schedText)) = 0 Then
        MsgBox "Could not parse Claude's response." & vbNewLine & Left(resp, 500), vbExclamation: Exit Sub
    End If
    WriteSchedule schedText
    MsgBox "Schedule generated! Running conflict check...", vbInformation, "Done"
    ThisWorkbook.Sheets("Schedule").Activate
    CheckConflicts
End Sub

'=============================================================================
' 7.  CLEAR SCHEDULE
'=============================================================================

Public Sub ClearSchedule()
    If MsgBox("Clear the current schedule output?", vbYesNo + vbQuestion, "Clear") = vbNo Then Exit Sub
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets("Schedule")
    Dim last As Long: last = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    If last >= 5 Then
        ws.Range("A5:K" & last).ClearContents
        ws.Range("A5:K" & last).Interior.ColorIndex = xlNone
        ws.Range("A5:K" & last).Font.Color = RGB(0, 0, 0)
    End If
    ws.Range("A2").Value = "Cleared  " & Format(Now, "mmmm d, yyyy  h:mm AM/PM")
End Sub

'=============================================================================
' 8.  PROMPT BUILDER
'=============================================================================

Private Function BuildPrompt() As String
    Dim wb As Workbook: Set wb = ThisWorkbook

    ' --- Courses ---
    Dim wsC As Worksheet
    On Error Resume Next: Set wsC = wb.Sheets("Courses"): On Error GoTo 0
    If wsC Is Nothing Then
        MsgBox "Courses sheet not found. Run Setup first.", vbExclamation
        BuildPrompt = "": Exit Function
    End If
    Dim lastC As Long: lastC = wsC.Cells(wsC.Rows.Count, 1).End(xlUp).Row
    If lastC < 2 Then
        MsgBox "No courses found. Complete Step 1 (Import Enrollment Data) first.", vbExclamation
        BuildPrompt = "": Exit Function
    End If

    Dim courseBlock As String
    courseBlock = "CRN|Course Code|Title|Section|Enrollment|Max Cap|Credits|Type|Days|Timeslot|Room|Instructor|Notes" & vbLf
    Dim r As Long
    For r = 2 To lastC
        If Trim(CStr(wsC.Cells(r, 1).Value)) = "" Then GoTo NC
        If wsC.Cells(r, 1).Font.Italic Then GoTo NC
        Dim line As String
        line = SC(wsC, r, 1) & "|" & SC(wsC, r, 2) & "|" & SC(wsC, r, 3) & "|" & _
               SC(wsC, r, 4) & "|" & SC(wsC, r, 5) & "|" & SC(wsC, r, 6) & "|" & _
               SC(wsC, r, 7) & "|" & SC(wsC, r, 8) & "|" & SC(wsC, r, 9) & "|" & _
               SC(wsC, r, 10) & "|" & SC(wsC, r, 11) & "|" & SC(wsC, r, 12) & "|" & SC(wsC, r, 13)
        courseBlock = courseBlock & line & vbLf
        NC:
    Next r

    ' --- Rooms ---
    Dim wsR As Worksheet
    On Error Resume Next: Set wsR = wb.Sheets("Rooms"): On Error GoTo 0
    Dim roomBlock As String: roomBlock = ""
    If Not wsR Is Nothing Then
        Dim lastR As Long: lastR = wsR.Cells(wsR.Rows.Count, 1).End(xlUp).Row
        If lastR >= 2 Then
            roomBlock = "Room|Building|Capacity|Type|Notes" & vbLf
            For r = 2 To lastR
                If Trim(CStr(wsR.Cells(r, 1).Value)) <> "" Then
                    roomBlock = roomBlock & SC(wsR, r, 1) & "|" & SC(wsR, r, 2) & "|" & _
                                SC(wsR, r, 3) & "|" & SC(wsR, r, 4) & "|" & SC(wsR, r, 5) & vbLf
                End If
            Next r
        End If
    End If

    ' --- Constraints ---
    Dim wsX As Worksheet
    On Error Resume Next: Set wsX = wb.Sheets("Constraints"): On Error GoTo 0
    Dim constBlock As String: constBlock = "(none specified)"
    If Not wsX Is Nothing Then
        Dim lastX As Long: lastX = wsX.Cells(wsX.Rows.Count, 1).End(xlUp).Row
        Dim cb As String: cb = ""
        For r = 5 To lastX
            If Trim(CStr(wsX.Cells(r, 1).Value)) <> "" And Not wsX.Cells(r, 1).Font.Italic Then
                cb = cb & "- [" & Trim(CStr(wsX.Cells(r, 1).Value)) & "] " & Trim(CStr(wsX.Cells(r, 2).Value)) & vbLf
            End If
        Next r
        If Trim(cb) <> "" Then constBlock = cb
    End If

    ' --- Assemble ---
    Dim p As String
    p = "You are an expert academic schedule builder at Mason School of Business, College of William & Mary." & vbLf & vbLf
    p = p & "Your task: assign rooms, days, and time slots to these Fall 2026 undergraduate courses." & vbLf
    p = p & "Keep any existing room/day/time assignments. Only fill in what is blank or marked TBD." & vbLf & vbLf
    p = p & "## COURSES" & vbLf & courseBlock & vbLf
    If roomBlock <> "" Then p = p & "## AVAILABLE ROOMS" & vbLf & roomBlock & vbLf
    p = p & "## CONSTRAINTS" & vbLf & constBlock & vbLf & vbLf
    p = p & "## SCHEDULING RULES" & vbLf
    p = p & "- Standard MW/TR slots (75 min): 8:00-9:15, 9:30-10:45, 11:00-12:15, 12:30-1:45, 2:00-3:15, 3:30-4:45, 5:00-6:15, 6:30-7:45" & vbLf
    p = p & "- Standard MWF slots (50 min): 8:00-8:50, 9:00-9:50, 10:00-10:50, 11:00-11:50, 12:00-12:50, 1:00-1:50, 2:00-2:50, 3:00-3:50" & vbLf
    p = p & "- No room double-booking: one class per room per time slot." & vbLf
    p = p & "- No instructor double-booking: one class per instructor per time slot." & vbLf
    p = p & "- Room capacity must be >= enrollment." & vbLf
    p = p & "- Reserve Room 1019 (Finance Lab) for finance/markets courses only." & vbLf
    p = p & "- Reserve Room 1008 (Design Lab) for experiential/design courses only." & vbLf
    p = p & "- Reserve ISC 1127 (180 seats) only for courses needing 100+ seats." & vbLf & vbLf
    p = p & "## OUTPUT FORMAT" & vbLf
    p = p & "Put the complete schedule between these exact markers:" & vbLf
    p = p & SCH_START & vbLf
    p = p & "CRN|Course Code|Title|Enrollment|Type|Room|Days|Start Time|End Time|Instructor|Issues/Notes" & vbLf
    p = p & "(one pipe-delimited row per section; no extra spaces; include ALL courses)" & vbLf
    p = p & SCH_END & vbLf & vbLf
    p = p & "Then list any conflicts or unresolved issues between:" & vbLf
    p = p & ISS_START & vbLf & "(one per line, or 'None')" & vbLf & ISS_END
    BuildPrompt = p
End Function

Private Function SC(ws As Worksheet, r As Long, c As Integer) As String
    SC = Replace(Trim(CStr(ws.Cells(r, c).Value)), "|", "/")
End Function

'=============================================================================
' 9.  API CALL  (automated mode)
'=============================================================================

Private Function CallClaude(prompt As String, apiKey As String) As String
    On Error GoTo ErrH
    Dim http As Object: Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
    Dim body As String
    body = "{""model"":""" & MODEL & """,""max_tokens"":8000," & _
           """messages"":[{""role"":""user"",""content"":""" & JsonEsc(prompt) & """}]}"
    http.Open "POST", API_URL, False
    http.SetRequestHeader "Content-Type", "application/json"
    http.SetRequestHeader "x-api-key", apiKey
    http.SetRequestHeader "anthropic-version", "2023-06-01"
    http.SetTimeouts 30000, 30000, 120000, 120000
    http.Send body
    If http.Status <> 200 Then
        CallClaude = "ERROR: HTTP " & http.Status & " - " & Left(http.ResponseText, 400): Exit Function
    End If
    Dim rText As String: rText = http.ResponseText
    Dim pos As Long: pos = InStr(rText, """text"":""")
    If pos = 0 Then CallClaude = "ERROR: Unexpected format - " & Left(rText, 400): Exit Function
    pos = pos + 8
    Dim result As String: result = ""
    Dim ch As String, nx As String
    Do While pos <= Len(rText)
        ch = Mid(rText, pos, 1)
        If ch = "\" Then
            nx = Mid(rText, pos + 1, 1)
            Select Case nx
                Case "n": result = result & vbLf:  pos = pos + 2
                Case "r":                           pos = pos + 2
                Case "t": result = result & vbTab: pos = pos + 2
                Case "\": result = result & "\":   pos = pos + 2
                Case """": result = result & """": pos = pos + 2
                Case "/":  result = result & "/":  pos = pos + 2
                Case Else: result = result & nx:    pos = pos + 2
            End Select
        ElseIf ch = """" Then
            Exit Do
        Else
            result = result & ch: pos = pos + 1
        End If
    Loop
    CallClaude = result: Exit Function
ErrH:
    CallClaude = "ERROR: " & Err.Description
End Function

'=============================================================================
' 10.  STRING HELPERS
'=============================================================================

Private Function JsonEsc(s As String) As String
    Dim r As String: r = s
    r = Replace(r, "\",    "\\")
    r = Replace(r, """",   "\""")
    r = Replace(r, vbCrLf, "\n")
    r = Replace(r, vbLf,   "\n")
    r = Replace(r, vbCr,   "\n")
    r = Replace(r, vbTab,  "\t")
    JsonEsc = r
End Function

Private Function Between(src As String, startMark As String, endMark As String) As String
    Dim s As Long: s = InStr(src, startMark)
    If s = 0 Then Between = "": Exit Function
    s = s + Len(startMark)
    Dim e As Long: e = InStr(s, src, endMark)
    If e = 0 Then Between = Trim(Mid(src, s)) Else Between = Trim(Mid(src, s, e - s))
End Function

'=============================================================================
' 11.  WRITE SCHEDULE OUTPUT
'=============================================================================

Private Sub WriteSchedule(schedText As String)
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets("Schedule")
    Dim last As Long: last = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    If last >= 5 Then
        ws.Range("A5:K" & last).ClearContents
        ws.Range("A5:K" & last).Interior.ColorIndex = xlNone
        ws.Range("A5:K" & last).Font.Color = RGB(0, 0, 0)
    End If
    ws.Range("A2").Value = "Generated: " & Format(Now, "mmmm d, yyyy  h:mm AM/PM")
    ws.Range("A2").Font.Italic = True: ws.Range("A2").Font.Color = RGB(80, 80, 80)

    Dim lines() As String
    If InStr(schedText, vbLf) > 0 Then lines = Split(schedText, vbLf) Else lines = Split(schedText, vbCrLf)

    Dim outRow As Long: outRow = 5
    Dim li As Long
    For li = 0 To UBound(lines)
        Dim line As String: line = Trim(lines(li))
        If line = "" Then GoTo NL
        If InStr(1, line, "CRN|", vbTextCompare) = 1 Or InStr(1, line, "CRN |", vbTextCompare) = 1 Then GoTo NL
        Dim fields() As String: fields = Split(line, "|")
        If UBound(fields) < 7 Then GoTo NL
        Dim f As Integer
        For f = 0 To UBound(fields)
            If f > 10 Then Exit For
            ws.Cells(outRow, f + 1).Value = Trim(fields(f))
        Next f
        If UBound(fields) >= 4 Then ColourRow ws, outRow, LCase(Trim(fields(4)))
        outRow = outRow + 1
        NL:
    Next li
    If outRow > 5 Then
        ws.Range("K5:K" & outRow - 1).WrapText = True
        ws.Rows("5:" & outRow - 1).AutoFit
    End If
End Sub

Private Sub ColourRow(ws As Worksheet, rowNum As Long, ctype As String)
    Dim bg As Long
    Select Case ctype
        Case "core":         bg = RGB(220, 230, 241)
        Case "required":     bg = RGB(226, 239, 218)
        Case "elective":     bg = RGB(255, 242, 204)
        Case "prerequisite": bg = RGB(242, 220, 219)
        Case Else:           bg = RGB(255, 255, 255)
    End Select
    ws.Range(ws.Cells(rowNum, 1), ws.Cells(rowNum, 11)).Interior.Color = bg
    Dim iss As String: iss = Trim(CStr(ws.Cells(rowNum, 11).Value))
    If Len(iss) > 0 And LCase(iss) <> "none" Then
        ws.Cells(rowNum, 11).Interior.Color = RGB(255, 199, 206)
        ws.Cells(rowNum, 11).Font.Color = RGB(156, 0, 6)
    End If
End Sub

'=============================================================================
' 12.  SETTINGS HELPERS
'=============================================================================

Private Function ReadAPIKey() As String
    Dim ws As Worksheet
    On Error Resume Next: Set ws = ThisWorkbook.Sheets("Settings"): On Error GoTo 0
    If ws Is Nothing Then ReadAPIKey = "": Exit Function
    ReadAPIKey = Trim(CStr(ws.Range("B3").Value))
End Function

Private Sub OpenSettings()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets("Settings")
    Dim key As String
    key = Trim(InputBox( _
        "Paste your Anthropic API key below." & vbNewLine & vbNewLine & _
        "Get one at console.anthropic.com > API Keys > Create Key" & vbNewLine & _
        "(Key starts with  sk-ant-  and costs ~$0.10 per use)", _
        "Enter Anthropic API Key", ws.Range("B3").Value))
    If key = "" Then
        MsgBox "No key entered. Use the free clipboard option instead.", vbInformation
        Exit Sub
    End If
    ws.Range("B3").Value = key
    ThisWorkbook.Save
    MsgBox "API key saved!", vbInformation, "Saved"
End Sub
