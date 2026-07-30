// Maestro runScript helper — computes a start time N seconds from now and
// formats it for the MUI DateTimePicker text field (en-US locale: M/D/YYYY HH:MM AM/PM).

var OFFSET_SECONDS = 90; // event fires 90 seconds from now

var now = new Date();
var target = new Date(now.getTime() + OFFSET_SECONDS * 1000);

function pad(n) { return String(n).padStart(2, "0"); }

var month  = target.getMonth() + 1;
var day    = target.getDate();
var year   = target.getFullYear();
var hours  = target.getHours();
var ampm   = hours >= 12 ? "PM" : "AM";
var h12    = hours % 12 || 12;
var mins   = pad(target.getMinutes());

// MUI DateTimePicker en-US format: "MM/DD/YYYY hh:mm AM"
output.startTime = month + "/" + day + "/" + year + " " + h12 + ":" + mins + " " + ampm;

// End time = start + 1 hour
var endTarget = new Date(target.getTime() + 60 * 60 * 1000);
var eh12   = endTarget.getHours() % 12 || 12;
var emins  = pad(endTarget.getMinutes());
var eampm  = endTarget.getHours() >= 12 ? "PM" : "AM";
output.endTime   = month + "/" + day + "/" + year + " " + eh12 + ":" + emins + " " + eampm;

// Today's day number (e.g. "22") — used to tap the correct cell in the calendar.
output.todayDay = String(now.getDate());

// Current hour (0-23) — used as the index into the DayView's "time slot" cells.
// The DayView auto-scrolls to show the current time, so this cell is always visible.
output.currentHour = String(now.getHours());

// How long (ms) to wait after saving before checking for the notification.
// 90s + 10s buffer.
output.waitMs = String((OFFSET_SECONDS + 10) * 1000);
