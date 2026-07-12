package app.formstr.calendar;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Reconciles the complete desired calendar reminder set for a rolling 48-hour
 * window. AlarmManager is only an execution mechanism; this worker owns every
 * scheduling, edit, recurrence, preference, and deletion decision.
 */
public class NotificationWorker extends Worker {

    private static final String TAG = "NotificationWorker";
    private static final String PREFS_NAME = "CapacitorStorage";
    private static final String EVENTS_KEY = "cal:events";
    private static final String CALENDARS_KEY = "cal:calendar_lists";
    private static final String NOTIFICATION_PREFERENCES_KEY = "cal:notification-preferences";
    static final String SCHEDULED_NOTIFICATIONS_KEY = "cal:scheduled-event-notifications-v2";
    private static final String IMMEDIATE_WORK_NAME = "calendar_notification_reconcile";
    private static final String NOTIFICATION_KEY_VERSION = "v2";
    private static final long SCHEDULE_WINDOW_MS = 2L * 24 * 60 * 60 * 1000;
    private static final int[] DEFAULT_REMINDER_OFFSETS_MINUTES = new int[]{10, 0};

    private static final class DesiredNotification {
        final String key;
        final int id;
        final String title;
        final String body;
        final String eventId;
        final long scheduledAt;

        DesiredNotification(String key, int id, String title, String body,
                            String eventId, long scheduledAt) {
            this.key = key;
            this.id = id;
            this.title = title;
            this.body = body;
            this.eventId = eventId;
            this.scheduledAt = scheduledAt;
        }
    }

    public NotificationWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    static void enqueueImmediate(Context context) {
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(NotificationWorker.class).build();
        WorkManager.getInstance(context.getApplicationContext()).enqueueUniqueWork(
                IMMEDIATE_WORK_NAME,
                ExistingWorkPolicy.REPLACE,
                request
        );
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        Log.d(TAG, "Notification reconciliation starting");

        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            if (!hasNotificationPermission(context)) {
                clearScheduledNotifications(context);
                Log.d(TAG, "Notification permission is not granted; schedule cleared");
                return Result.success();
            }

            JSONArray events = parseArray(prefs.getString(EVENTS_KEY, null));
            JSONArray calendars = parseArray(prefs.getString(CALENDARS_KEY, null));
            JSONObject notificationPreferences = parseObject(
                    prefs.getString(NOTIFICATION_PREFERENCES_KEY, null));
            long now = System.currentTimeMillis();
            long scheduleEnd = now + SCHEDULE_WINDOW_MS;
            Map<String, DesiredNotification> desired = new LinkedHashMap<>();

            for (int i = 0; i < events.length(); i++) {
                collectEventNotifications(
                        events.getJSONObject(i),
                        calendars,
                        notificationPreferences,
                        now,
                        scheduleEnd,
                        desired
                );
            }

            reconcile(context, prefs, desired);
            Log.d(TAG, "Notification reconciliation finished. Desired alarms=" + desired.size());
            CalendarWidget.refreshAll(context);
            return Result.success();
        } catch (JSONException error) {
            Log.e(TAG, "Failed to parse notification data", error);
            return Result.success();
        } catch (Exception error) {
            Log.e(TAG, "Notification reconciliation failed", error);
            return Result.retry();
        }
    }

    private void collectEventNotifications(
            JSONObject event,
            JSONArray calendars,
            JSONObject notificationPreferences,
            long now,
            long scheduleEnd,
            Map<String, DesiredNotification> desired
    ) throws JSONException {
        if (!shouldScheduleEvent(event, calendars)) return;

        long begin = event.getLong("begin");
        long end = event.optLong("end", begin);
        String eventId = event.getString("id");
        String title = event.optString("title", "Untitled event");
        List<Integer> offsets = getReminderOffsets(notificationPreferences, eventId);
        if (offsets.isEmpty()) return;

        int maxOffsetMinutes = 0;
        for (int offset : offsets) maxOffsetMinutes = Math.max(maxOffsetMinutes, offset);
        long occurrenceSearchEnd = safeAdd(scheduleEnd, maxOffsetMinutes * 60L * 1000L);
        List<Long> occurrences = getOccurrences(event, begin, end, now, occurrenceSearchEnd);
        String location = getFirstLocation(event);

        for (long occurrenceStart : occurrences) {
            for (int offsetMinutes : offsets) {
                long scheduledAt = occurrenceStart - offsetMinutes * 60L * 1000L;
                if (scheduledAt <= now || scheduledAt > scheduleEnd) continue;

                String notificationKey = NOTIFICATION_KEY_VERSION
                        + ":" + eventId
                        + ":" + occurrenceStart
                        + ":m" + offsetMinutes;
                int notificationId = hashToNumber(notificationKey);
                String notificationTitle = offsetMinutes == 0 ? title : "Upcoming: " + title;
                desired.put(notificationKey, new DesiredNotification(
                        notificationKey,
                        notificationId,
                        notificationTitle,
                        getNotificationBody(offsetMinutes, location),
                        eventId,
                        scheduledAt
                ));
            }
        }
    }

    private List<Long> getOccurrences(JSONObject event, long begin, long end,
                                      long rangeStart, long rangeEnd) {
        JSONObject repeat = event.optJSONObject("repeat");
        String rrule = normalizeRrule(repeat == null ? null : repeat.opt("rrule"));
        if (rrule.isEmpty()) {
            List<Long> occurrence = new ArrayList<>();
            if (begin >= rangeStart && begin <= rangeEnd) occurrence.add(begin);
            return occurrence;
        }
        return RecurrenceUtils.getOccurrencesInRange(
                begin, end, rrule, rangeStart, rangeEnd);
    }

    static String normalizeRrule(Object value) {
        return value instanceof String ? ((String) value).trim() : "";
    }

    private boolean shouldScheduleEvent(JSONObject event, JSONArray calendars) {
        String eventPreference = event.optString("notificationPreference", "");
        if ("enabled".equals(eventPreference)) return true;
        if ("disabled".equals(eventPreference)) return false;

        JSONObject calendar = findCalendar(event, calendars);
        return calendar == null
                || !"disabled".equals(calendar.optString("notificationPreference", "enabled"));
    }

    private JSONObject findCalendar(JSONObject event, JSONArray calendars) {
        String calendarId = event.optString("calendarId", "");
        String coordinate = event.optInt("kind", 0)
                + ":" + event.optString("user", "")
                + ":" + event.optString("id", "");

        for (int i = 0; i < calendars.length(); i++) {
            JSONObject calendar = calendars.optJSONObject(i);
            if (calendar == null) continue;
            if (!calendarId.isEmpty() && calendarId.equals(calendar.optString("id", ""))) {
                return calendar;
            }

            JSONArray refs = calendar.optJSONArray("eventRefs");
            if (refs == null) continue;
            for (int refIndex = 0; refIndex < refs.length(); refIndex++) {
                JSONArray ref = refs.optJSONArray(refIndex);
                if (ref != null && coordinate.equals(ref.optString(0, ""))) return calendar;
            }
        }
        return null;
    }

    private List<Integer> getReminderOffsets(JSONObject preferences, String eventId) {
        List<Integer> offsets = new ArrayList<>();
        JSONObject eventPreference = preferences.optJSONObject(eventId);
        JSONArray configured = eventPreference == null
                ? null
                : eventPreference.optJSONArray("offsetsMinutes");

        if (configured == null) {
            for (int offset : DEFAULT_REMINDER_OFFSETS_MINUTES) offsets.add(offset);
            return offsets;
        }

        for (int i = 0; i < configured.length(); i++) {
            int offset = configured.optInt(i, -1);
            if (offset >= 0 && !offsets.contains(offset)) offsets.add(offset);
        }
        return offsets;
    }

    private void reconcile(Context context, SharedPreferences prefs,
                           Map<String, DesiredNotification> desired) {
        Map<String, Integer> previous = loadScheduledNotifications(prefs);
        for (Map.Entry<String, Integer> entry : previous.entrySet()) {
            if (!desired.containsKey(entry.getKey())) {
                cancelAlarm(context, entry.getValue());
            }
        }

        Map<String, Integer> scheduled = new LinkedHashMap<>();
        for (DesiredNotification notification : desired.values()) {
            scheduled.put(notification.key, notification.id);
        }
        // Publish the new source of truth before setting alarms so even an
        // alarm due immediately can validate itself in the receiver.
        saveScheduledNotifications(prefs, scheduled);
        for (DesiredNotification notification : desired.values()) {
            scheduleAlarm(context, notification);
        }
    }

    private boolean scheduleAlarm(Context context, DesiredNotification notification) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return false;

        Intent intent = new Intent(context, NotificationReceiver.class);
        intent.putExtra(NotificationReceiver.EXTRA_NOTIFICATION_ID, notification.id);
        intent.putExtra(NotificationReceiver.EXTRA_NOTIFICATION_KEY, notification.key);
        intent.putExtra(NotificationReceiver.EXTRA_TITLE, notification.title);
        intent.putExtra(NotificationReceiver.EXTRA_BODY, notification.body);
        intent.putExtra(NotificationReceiver.EXTRA_EVENT_ID, notification.eventId);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context,
                notification.id,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !manager.canScheduleExactAlarms()) {
            manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, notification.scheduledAt, pendingIntent);
        } else {
            manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, notification.scheduledAt, pendingIntent);
        }
        return true;
    }

    private static void cancelAlarm(Context context, int notificationId) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        Intent intent = new Intent(context, NotificationReceiver.class);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context,
                notificationId,
                intent,
                PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
        );
        if (pendingIntent != null) {
            if (alarmManager != null) alarmManager.cancel(pendingIntent);
            pendingIntent.cancel();
        }

        NotificationManager notificationManager = (NotificationManager)
                context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null) notificationManager.cancel(notificationId);
    }

    static void clearScheduledNotifications(Context context) {
        SharedPreferences prefs = context.getApplicationContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        for (int id : new HashSet<>(loadScheduledNotifications(prefs).values())) {
            cancelAlarm(context.getApplicationContext(), id);
        }
        prefs.edit().remove(SCHEDULED_NOTIFICATIONS_KEY).apply();
    }

    static void cancelEventNotifications(Context context, String eventId) {
        Context applicationContext = context.getApplicationContext();
        SharedPreferences prefs = applicationContext
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        Map<String, Integer> scheduled = loadScheduledNotifications(prefs);
        String eventKeyPrefix = NOTIFICATION_KEY_VERSION + ":" + eventId + ":";
        List<String> keysToRemove = new ArrayList<>();

        for (Map.Entry<String, Integer> entry : scheduled.entrySet()) {
            if (entry.getKey().startsWith(eventKeyPrefix)) {
                cancelAlarm(applicationContext, entry.getValue());
                keysToRemove.add(entry.getKey());
            }
        }
        for (String key : keysToRemove) scheduled.remove(key);
        saveScheduledNotifications(prefs, scheduled);
    }

    static boolean isNotificationRegistered(Context context, String key, int id) {
        if (key == null || key.isEmpty()) return false;
        SharedPreferences prefs = context.getApplicationContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        Integer registeredId = loadScheduledNotifications(prefs).get(key);
        return registeredId != null && registeredId == id;
    }

    private static Map<String, Integer> loadScheduledNotifications(SharedPreferences prefs) {
        Map<String, Integer> result = new LinkedHashMap<>();
        String json = prefs.getString(SCHEDULED_NOTIFICATIONS_KEY, null);
        if (json == null || json.isEmpty()) return result;
        try {
            JSONObject object = new JSONObject(json);
            for (java.util.Iterator<String> keys = object.keys(); keys.hasNext(); ) {
                String key = keys.next();
                result.put(key, object.getInt(key));
            }
        } catch (JSONException error) {
            Log.w(TAG, "Discarding invalid scheduled notification registry", error);
        }
        return result;
    }

    private static void saveScheduledNotifications(SharedPreferences prefs,
                                                   Map<String, Integer> scheduled) {
        JSONObject object = new JSONObject();
        for (Map.Entry<String, Integer> entry : scheduled.entrySet()) {
            try {
                object.put(entry.getKey(), entry.getValue());
            } catch (JSONException ignored) {
                // String/int pairs are always JSON-safe.
            }
        }
        prefs.edit().putString(SCHEDULED_NOTIFICATIONS_KEY, object.toString()).apply();
    }

    private static JSONArray parseArray(String value) throws JSONException {
        return value == null || value.isEmpty() ? new JSONArray() : new JSONArray(value);
    }

    private static JSONObject parseObject(String value) throws JSONException {
        return value == null || value.isEmpty() ? new JSONObject() : new JSONObject(value);
    }

    private static boolean hasNotificationPermission(Context context) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    }

    private static int hashToNumber(String value) {
        int hash = 0;
        for (int i = 0; i < value.length(); i++) hash = hash * 31 + value.charAt(i);
        if (hash == Integer.MIN_VALUE) return Integer.MAX_VALUE;
        int positive = Math.abs(hash);
        return positive == 0 ? 1 : positive;
    }

    private static long safeAdd(long left, long right) {
        if (right > 0 && left > Long.MAX_VALUE - right) return Long.MAX_VALUE;
        return left + right;
    }

    private static String getFirstLocation(JSONObject event) {
        JSONArray locations = event.optJSONArray("location");
        if (locations == null) return null;
        for (int i = 0; i < locations.length(); i++) {
            String location = locations.optString(i, "");
            if (!location.isEmpty()) return location;
        }
        return null;
    }

    private static String getNotificationBody(int offsetMinutes, String location) {
        String body = offsetMinutes == 0
                ? "Starting now"
                : "Starts in " + offsetMinutes + " minute" + (offsetMinutes == 1 ? "" : "s");
        return location == null || location.isEmpty() ? body : body + " at " + location;
    }
}
