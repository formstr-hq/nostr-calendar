package app.formstr.calendar;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.HashSet;
import java.util.Set;

/**
 * Background worker that periodically reads cached calendar events from
 * Capacitor Preferences (SharedPreferences) and schedules local notifications
 * for recurring events due within the next 2 days.
 */
public class NotificationWorker extends Worker {

    private static final String TAG = "NotificationWorker";
    private static final String PREFS_NAME = "CapacitorStorage";
    private static final String EVENTS_KEY = "cal:events";
    private static final long TWO_DAYS_MS = 2L * 24 * 60 * 60 * 1000;
    private static final long TEN_MINUTES_MS = 10L * 60 * 1000;

    public NotificationWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Log.d(TAG, "NotificationWorker starting");

        try {
            SharedPreferences prefs = getApplicationContext()
                    .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String eventsJson = prefs.getString(EVENTS_KEY, null);

            if (eventsJson == null || eventsJson.isEmpty()) {
                Log.d(TAG, "No cached events found");
                return Result.success();
            }

            JSONArray events = new JSONArray(eventsJson);
            Set<Integer> existingNotificationIds = getExistingNotificationIds();
            long now = System.currentTimeMillis();
            long twoDaysFromNow = now + TWO_DAYS_MS;
            int scheduled = 0;

            for (int i = 0; i < events.length(); i++) {
                JSONObject event = events.getJSONObject(i);
                scheduled += processEvent(event, now, twoDaysFromNow, existingNotificationIds);
            }

            Log.d(TAG, "NotificationWorker finished. Scheduled " + scheduled + " notifications.");
            return Result.success();
        } catch (JSONException e) {
            Log.e(TAG, "Failed to parse events JSON", e);
            return Result.success(); // Don't retry on parse errors
        } catch (Exception e) {
            Log.e(TAG, "NotificationWorker failed", e);
            return Result.retry();
        }
    }

    private int processEvent(JSONObject event, long now, long twoDaysFromNow,
                              Set<Integer> existingNotificationIds) {
        try {
            JSONObject repeat = event.optJSONObject("repeat");
            String rrule = (repeat != null && !repeat.isNull("rrule"))
                    ? repeat.getString("rrule") : null;

            // Only process recurring events
            if (rrule == null || rrule.isEmpty()) {
                return 0;
            }

            long begin = event.getLong("begin");
            long end = event.getLong("end");
            String eventId = event.getString("eventId");
            String title = event.getString("title");

            // Build location string from location array
            String location = buildLocationString(event);

            // Find the next occurrence in the 2-day window
            long nextOccurrence = getNextOccurrenceInRange(begin, end, rrule, now, twoDaysFromNow);
            if (nextOccurrence < 0) {
                return 0;
            }

            // Build notification key matching the JS side
            String notificationKey = eventId + ":" + nextOccurrence;
            int baseId = hashToNumber(notificationKey);

            int count = 0;

            // Schedule "10 minutes before" notification
            long tenMinBefore = nextOccurrence - TEN_MINUTES_MS;
            if (tenMinBefore > now && !existingNotificationIds.contains(baseId)) {
                String body = location != null
                        ? "Starts in 10 minutes at " + location
                        : "Starts in 10 minutes";
                scheduleAlarm(baseId, "Upcoming: " + title, body, eventId, tenMinBefore);
                count++;
            }

            // Schedule "starting now" notification
            if (nextOccurrence > now && !existingNotificationIds.contains(baseId + 1)) {
                String body = location != null
                        ? "Starting now at " + location
                        : "Starting now";
                scheduleAlarm(baseId + 1, title, body, eventId, nextOccurrence);
                count++;
            }

            if (count > 0) {
                Log.d(TAG, "Scheduled " + count + " notifications for event: " + title
                        + " (next occurrence: " + new java.util.Date(nextOccurrence) + ")");
            }
            return count;
        } catch (JSONException e) {
            Log.w(TAG, "Failed to process event", e);
            return 0;
        }
    }

    private String buildLocationString(JSONObject event) {
        JSONArray locationArray = event.optJSONArray("location");
        if (locationArray == null || locationArray.length() == 0) {
            return null;
        }
        try {
            String first = locationArray.getString(0);
            return (first != null && !first.isEmpty()) ? first : null;
        } catch (JSONException e) {
            return null;
        }
    }

    /**
     * Hash function matching the JS side's hashToNumber for consistent notification IDs.
     */
    private static int hashToNumber(String str) {
        int hash = 0;
        for (int i = 0; i < str.length(); i++) {
            hash = (hash * 31 + str.charAt(i));
        }
        return (Math.abs(hash) >> 1) * 2;
    }

    /**
     * Compute the next occurrence of a recurring event within [rangeStart, rangeEnd].
     * Supports the 6 predefined frequencies used by the app.
     * Returns -1 if no occurrence falls in the range.
     */
    private long getNextOccurrenceInRange(long begin, long end, String rrule,
                                           long rangeStart, long rangeEnd) {
        String normalized = rrule.replaceFirst("(?i)^RRULE:", "").trim();

        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(begin);

        // Parse FREQ and INTERVAL from the rrule string
        String freq = null;
        int interval = 1;
        String byDay = null;

        for (String part : normalized.split(";")) {
            String[] kv = part.split("=", 2);
            if (kv.length != 2) continue;
            switch (kv[0].toUpperCase()) {
                case "FREQ":
                    freq = kv[1].toUpperCase();
                    break;
                case "INTERVAL":
                    interval = Integer.parseInt(kv[1]);
                    break;
                case "BYDAY":
                    byDay = kv[1].toUpperCase();
                    break;
            }
        }

        if (freq == null) return -1;

        // For WEEKLY with BYDAY (weekdays), use special handling
        if ("WEEKLY".equals(freq) && byDay != null) {
            return getNextWeekdayOccurrence(begin, byDay, rangeStart, rangeEnd);
        }

        // Step through occurrences from the event start date
        // using the frequency until we pass rangeEnd
        long current = begin;
        while (current <= rangeEnd) {
            if (current >= rangeStart && current <= rangeEnd) {
                return current;
            }
            current = advanceByFrequency(current, freq, interval);
            if (current <= begin) break; // overflow protection
        }

        return -1;
    }

    private long advanceByFrequency(long timestamp, String freq, int interval) {
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(timestamp);

        switch (freq) {
            case "DAILY":
                cal.add(Calendar.DAY_OF_MONTH, interval);
                break;
            case "WEEKLY":
                cal.add(Calendar.WEEK_OF_YEAR, interval);
                break;
            case "MONTHLY":
                cal.add(Calendar.MONTH, interval);
                break;
            case "YEARLY":
                cal.add(Calendar.YEAR, interval);
                break;
            default:
                return Long.MAX_VALUE;
        }

        return cal.getTimeInMillis();
    }

    /**
     * Handle WEEKLY;BYDAY=MO,TU,WE,TH,FR (weekday recurrence).
     * Steps day-by-day from begin, checking if the day matches the BYDAY set.
     */
    private long getNextWeekdayOccurrence(long begin, String byDay,
                                           long rangeStart, long rangeEnd) {
        Set<Integer> allowedDays = new HashSet<>();
        for (String day : byDay.split(",")) {
            switch (day.trim()) {
                case "MO": allowedDays.add(Calendar.MONDAY); break;
                case "TU": allowedDays.add(Calendar.TUESDAY); break;
                case "WE": allowedDays.add(Calendar.WEDNESDAY); break;
                case "TH": allowedDays.add(Calendar.THURSDAY); break;
                case "FR": allowedDays.add(Calendar.FRIDAY); break;
                case "SA": allowedDays.add(Calendar.SATURDAY); break;
                case "SU": allowedDays.add(Calendar.SUNDAY); break;
            }
        }

        Calendar cal = Calendar.getInstance();
        // Start from the later of begin or rangeStart, preserving the time-of-day from begin
        Calendar beginCal = Calendar.getInstance();
        beginCal.setTimeInMillis(begin);

        if (begin < rangeStart) {
            cal.setTimeInMillis(rangeStart);
            // Preserve the time-of-day from the original event
            cal.set(Calendar.HOUR_OF_DAY, beginCal.get(Calendar.HOUR_OF_DAY));
            cal.set(Calendar.MINUTE, beginCal.get(Calendar.MINUTE));
            cal.set(Calendar.SECOND, beginCal.get(Calendar.SECOND));
            cal.set(Calendar.MILLISECOND, beginCal.get(Calendar.MILLISECOND));
            // If we're already past this time today, move to the next day
            if (cal.getTimeInMillis() < rangeStart) {
                cal.add(Calendar.DAY_OF_MONTH, 1);
            }
        } else {
            cal.setTimeInMillis(begin);
        }

        // Search up to rangeEnd (max ~2 days, so 3 iterations at most)
        while (cal.getTimeInMillis() <= rangeEnd) {
            if (allowedDays.contains(cal.get(Calendar.DAY_OF_WEEK))
                    && cal.getTimeInMillis() >= rangeStart) {
                return cal.getTimeInMillis();
            }
            cal.add(Calendar.DAY_OF_MONTH, 1);
        }

        return -1;
    }

    private void scheduleAlarm(int notificationId, String title, String body,
                                String eventId, long triggerAtMillis) {
        Context context = getApplicationContext();
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        Intent intent = new Intent(context, NotificationReceiver.class);
        intent.putExtra(NotificationReceiver.EXTRA_NOTIFICATION_ID, notificationId);
        intent.putExtra(NotificationReceiver.EXTRA_TITLE, title);
        intent.putExtra(NotificationReceiver.EXTRA_BODY, body);
        intent.putExtra(NotificationReceiver.EXTRA_EVENT_ID, eventId);

        PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context, notificationId, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
            // Fall back to inexact alarm
            alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
        } else {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
        }
    }

    private Set<Integer> getExistingNotificationIds() {
        Set<Integer> ids = new HashSet<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            NotificationManager manager = (NotificationManager)
                    getApplicationContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                for (StatusBarNotification sbn : manager.getActiveNotifications()) {
                    ids.add(sbn.getId());
                }
            }
        }
        return ids;
    }
}
