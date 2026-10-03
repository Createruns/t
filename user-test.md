# Personal Attendance Tracker AI Prompts

Here are several complex AI prompts designed to generate customized attendance templates. You can copy and paste these directly into the spreadsheet application.

## 1. The Punctuality & Late Arrival Tracker (Best for improving attendance)
This prompt creates a sheet that tracks exactly when you arrive, calculates if you were late, and flags problem days.

```text
Create a personal punctuality tracker for my work attendance. 
Generate 10 days of sample data with the following columns: Date, Scheduled Start Time, Actual Arrival Time, and Notes. 
After creating the data, please execute the following actions:
1. Create a new sheet named "Punctuality Log".
2. Add a new column called "Minutes Late" with a formula that calculates the difference. (You can use a simple IF statement or text for the formula, like =IF(C{row}>B{row}, 'Late', 'On Time')).
3. Add another column called "Status" with a formula that flags it as 'WARNING' if late, and 'GOOD' if on time.
4. Sort the table by "Date" descending.
```

## 2. Comprehensive Shift & Overtime Log (Best for resolving pay/hours disputes)
Use this if your company's time-clock system is inaccurate and you need your own evidence of hours worked.

```text
Create a personal timesheet to track my exact hours worked and overtime.
Generate 2 weeks of sample data including: Date, Day of Week, Clock-In Time, Clock-Out Time, Unpaid Break (Minutes), and Manager on Duty.
After generating the CSV data, please execute these actions:
1. Create a new sheet named "Timesheet Evidence".
2. Add a column called "Total Hours Worked" using a formula to represent the calculation (e.g., =8).
3. Add a column called "Overtime Hours" with a formula like =IF(G{row}>8, G{row}-8, 0).
4. Format the cells to make the header bold and visually distinct.
```

## 3. Personal Leave & PTO Balance Tracker (Best for managing absences)
If your attendance problems are related to taking too many sick days or running out of leave, this tracker helps you manage your balances.

```text
Create a Paid Time Off (PTO) and Absence tracker for my personal use.
Generate sample data for 8 instances of taking time off. The columns should be: Date, Type of Leave (Sick, Vacation, Unpaid, Personal), Hours Taken, and Reason/Notes.
After the data is generated, please run these actions:
1. Create a new sheet called "Leave Tracker".
2. Add a column called "Doctor Note Provided?" defaulting to 'Yes' or 'No'.
3. Add a column called "Impact on Attendance Score" with a formula like =IF(B{row}='Unpaid', 'High', 'Low').
4. Sort the table by "Date" so the most recent absences are at the top.
```

## 4. The "Action Plan" Daily Habit Tracker
If you are on an attendance improvement plan (PIP) and need to prove you are building better habits.

```text
Create a daily habit and attendance action plan tracker.
Generate 14 days of data with columns: Date, Woke up on time? (Yes/No), Left house on time? (Yes/No), Traffic/Transit Delay? (Yes/No), and Actual Arrival.
Then, execute these actions:
1. Create a new sheet called "Habit Tracker".
2. Add a column called "Success Score" with a formula that evaluates if you arrived on time (e.g. =IF(E{row}='09:00', '100%', '0%')).
3. Add a column called "Manager Sign-off" for your boss to initial every week.
```
