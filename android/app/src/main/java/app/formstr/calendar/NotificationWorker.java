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

import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Background worker that periodically reads cached calendar events from
 * Capacitor Preferences (SharedPreferences) and schedules local notifications
 * for recurring events due within the next 5 days.
 */
public class NotificationWorker extends Worker {

    private static final String TAG = "NotificationWorker";
    private static final String PREFS_NAME = "CapacitorStorage";
    private static final String EVENTS_KEY = "cal:events";
    private static final String NOTIFICATION_PREFERENCES_KEY = "cal:notification-preferences";
    private static final long SCHEDULE_WINDOW_MS = 5L * 24 * 60 * 60 * 1000;
    private static final int[] DEFAULT_REMINDER_OFFSETS_MINUTES = new int[]{10, 0};

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
            String notificationPreferencesJson =
                    prefs.getString(NOTIFICATION_PREFERENCES_KEY, null);

            if (eventsJson == null || eventsJson.isEmpty()) {
                Log.d(TAG, "No cached events found");
                return Result.success();
            }

            JSONArray events = new JSONArray(eventsJson);
            JSONObject notificationPreferences = notificationPreferencesJson == null
                    || notificationPreferencesJson.isEmpty()
                    ? new JSONObject()
                    : new JSONObject(notificationPreferencesJson);
            Set<Integer> existingNotificationIds = getExistingNotificationIds();
            long now = System.currentTimeMillis();
            long twoDaysFromNow = now + SCHEDULE_WINDOW_MS;
            int scheduled = 0;

            for (int i = 0; i < events.length(); i++) {
                JSONObject event = events.getJSONObject(i);
                scheduled += processEvent(
                        event,
                        notificationPreferences,
                        now,
                        twoDaysFromNow,
                        existingNotificationIds
                );
            }

            Log.d(TAG, "NotificationWorker finished. Scheduled " + scheduled + " notifications.");
            CalendarWidget.refreshAll(getApplicationContext());
            return Result.success();
        } catch (JSONException e) {
            Log.e(TAG, "Failed to parse events JSON", e);
            return Result.success(); // Don't retry on parse errors
        } catch (Exception e) {
            Log.e(TAG, "NotificationWorker failed", e);
            return Result.retry();
        }
    }

    private String getNotificationBody(int offsetMinutes, String location){
        String body;
        if(offsetMinutes <= 0){
            body = "Starting now";
        } else {
            body = "Starts in " + offsetMinutes + " minute" + (offsetMinutes == 1 ? "" : "s");
        }

        if (location != null && !location.isEmpty()) {
            return body + " at " + location;
        }

        return body;
    }

    private int processEvent(JSONObject event, JSONObject notificationPreferences,
                              long now, long twoDaysFromNow,
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
            String eventId = event.getString("id");
            String title = event.getString("title");
            List<Integer> reminderOffsets = getReminderOffsets(notificationPreferences, eventId);

            // Build location string from location array
            String location = buildLocationString(event);

            // Find the next occurrence in the schedule window
            long nextOccurrence = RecurrenceUtils.getNextOccurrenceInRange(
                    begin,
                    end,
                    rrule,
                    now,
                    twoDaysFromNow
            );
            if (nextOccurrence < 0) {
                return 0;
            }

            int count = 0;
            for (int offsetMinutes : reminderOffsets) {
                long scheduledAt = nextOccurrence - offsetMinutes * 60L * 1000L;
                if (scheduledAt <= now) {
                    continue;
                }

                String notificationKey = eventId + ":" + nextOccurrence + ":" + offsetMinutes;
                int notificationId = hashToNumber(notificationKey);
                if (existingNotificationIds.contains(notificationId)) {
                    continue;
                }

                String body = getNotificationBody(offsetMinutes, location);
                String notificationTitle = offsetMinutes <= 0 ? title : "Upcoming: " + title;
                scheduleAlarm(notificationId, notificationTitle, body, eventId, scheduledAt);
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

    private List<Integer> getReminderOffsets(JSONObject notificationPreferences, String eventId) {
        List<Integer> offsets = new ArrayList<>();
        JSONObject eventPreference = notificationPreferences.optJSONObject(eventId);
        JSONArray offsetsArray = eventPreference != null
                ? eventPreference.optJSONArray("offsetsMinutes")
                : null;

        if (offsetsArray == null) {
            for (int offset : DEFAULT_REMINDER_OFFSETS_MINUTES) {
                offsets.add(offset);
            }
            return offsets;
        }

        for (int i = 0; i < offsetsArray.length(); i++) {
            int offset = offsetsArray.optInt(i, -1);
            if (offset >= 0 && !offsets.contains(offset)) {
                offsets.add(offset);
            }
        }

        return offsets;
    }

    /**
     * Hash function matching the JS side's hashToNumber for consistent notification IDs.
     */
    private static int hashToNumber(String str) {
        int hash = 0;
        for (int i = 0; i < str.length(); i++) {
            hash = (hash * 31 + str.charAt(i));
        }
        int positiveHash = Math.abs(hash);
        return positiveHash != 0 ? positiveHash : 1;
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
