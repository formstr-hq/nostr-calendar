package app.formstr.calendar;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.CalendarContract;
import android.util.Log;
import android.widget.RemoteViews;

import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public class CalendarWidget extends AppWidgetProvider {

    private static final String TAG = "CalendarWidget";
    private static final String PREFS_NAME = "CapacitorStorage";
    private static final String EVENTS_KEY = "cal:events";
    static final class WidgetEvent {
        final String title;
        final long displayBegin;
        final boolean allDay;

        WidgetEvent(String title, long displayBegin, boolean allDay) {
            this.title = title;
            this.displayBegin = displayBegin;
            this.allDay = allDay;
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(
            Context context,
            AppWidgetManager appWidgetManager,
            int appWidgetId,
            Bundle newOptions
    ) {
        updateAppWidget(context, appWidgetManager, appWidgetId);
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            CalendarWidgetPreferences.delete(context, appWidgetId);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (Intent.ACTION_CONFIGURATION_CHANGED.equals(intent.getAction())) {
            refreshAll(context);
        }
    }

    /** Called by NotificationWorker whenever the event cache is fresh. */
    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, CalendarWidget.class));
        for (int id : ids) {
            updateAppWidget(context, manager, id);
        }
    }

    static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        try {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_calendar);

            // Tap anywhere to open the app
            Intent launchIntent = new Intent(context, MainActivity.class);
            launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent launchPending = PendingIntent.getActivity(
                    context, 0, launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_root, launchPending);
            views.setPendingIntentTemplate(R.id.widget_event_list, launchPending);

            // Date header: day name (small) + date (large)
            Date now = new Date();
            views.setTextViewText(R.id.widget_day_name,
                    new SimpleDateFormat("EEEE", Locale.getDefault()).format(now));
            views.setTextViewText(R.id.widget_date,
                    new SimpleDateFormat("MMMM d", Locale.getDefault()).format(now));

            Intent serviceIntent = new Intent(context, CalendarWidgetService.class);
            serviceIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
            serviceIntent.setData(Uri.parse(serviceIntent.toUri(Intent.URI_INTENT_SCHEME)));
            views.setRemoteAdapter(R.id.widget_event_list, serviceIntent);
            views.setEmptyView(R.id.widget_event_list, R.id.widget_empty);

            appWidgetManager.updateAppWidget(appWidgetId, views);
            appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetId, R.id.widget_event_list);
        } catch (Exception e) {
            Log.e(TAG, "Failed to update widget", e);
        }
    }

    // -------------------------------------------------------------------------
    // Event loading
    // -------------------------------------------------------------------------

    static List<WidgetEvent> getUpcomingEvents(Context context, int appWidgetId) {
        List<WidgetEvent> result = new ArrayList<>();
        long now = System.currentTimeMillis();
        long rangeEnd = sevenDayRangeEnd(now);
        boolean configured = CalendarWidgetPreferences.isConfigured(context, appWidgetId);
        Set<String> selectedNostrCalendarIds = configured
                ? CalendarWidgetPreferences.getNostrCalendarIds(context, appWidgetId)
                : null;
        Set<String> selectedDeviceCalendarIds = configured
                ? CalendarWidgetPreferences.getDeviceCalendarIds(context, appWidgetId)
                : new HashSet<>();

        addNostrEvents(context, selectedNostrCalendarIds, result, now, rangeEnd);
        addDeviceEvents(context, selectedDeviceCalendarIds, result, now, rangeEnd);

        result.sort((a, b) -> Long.compare(a.displayBegin, b.displayBegin));
        return result;
    }

    /** A null selection preserves the all-Nostr behavior for widgets created before configuration existed. */
    private static void addNostrEvents(
            Context context,
            Set<String> selectedCalendarIds,
            List<WidgetEvent> result,
            long now,
            long rangeEnd
    ) {
        if (selectedCalendarIds != null && selectedCalendarIds.isEmpty()) return;

        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String eventsJson = prefs.getString(EVENTS_KEY, null);
            if (eventsJson == null || eventsJson.isEmpty()) {
                return;
            }

            JSONArray all = new JSONArray(eventsJson);
            for (int i = 0; i < all.length(); i++) {
                JSONObject event = all.getJSONObject(i);
                String calendarId = event.optString("calendarId", "");
                if (selectedCalendarIds != null && !selectedCalendarIds.contains(calendarId)) {
                    continue;
                }

                long begin = event.optLong("begin", 0);
                long end = event.optLong("end", 0);
                long duration = Math.max(0L, end - begin);
                String title = event.optString("title", context.getString(R.string.widget_untitled));
                boolean allDay = event.optBoolean("allDay", false);

                JSONObject repeat = event.optJSONObject("repeat");
                String rrule = (repeat != null && !repeat.isNull("rrule"))
                        ? repeat.optString("rrule", "")
                        : "";

                if (rrule != null && !rrule.isEmpty()) {
                    long searchStart = Math.max(begin, now - duration);
                    long nextOccurrence = RecurrenceUtils.getNextOccurrenceInRange(
                            begin,
                            end,
                            rrule,
                            searchStart,
                            rangeEnd
                    );
                    if (nextOccurrence >= 0) {
                        result.add(new WidgetEvent(title, nextOccurrence, allDay));
                    }
                    continue;
                }

                // Keep events that have not fully ended yet and start within the seven-day window.
                long effectiveEnd = end > 0 ? end : begin;
                if (effectiveEnd >= now && begin <= rangeEnd) {
                    result.add(new WidgetEvent(title, begin, allDay));
                }
            }
        } catch (JSONException e) {
            Log.e(TAG, "Failed to parse cached events", e);
        }
    }

    private static void addDeviceEvents(
            Context context,
            Set<String> selectedCalendarIds,
            List<WidgetEvent> result,
            long now,
            long rangeEnd
    ) {
        if (selectedCalendarIds.isEmpty()
                || ContextCompat.checkSelfPermission(context, android.Manifest.permission.READ_CALENDAR)
                != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        Uri.Builder uriBuilder = CalendarContract.Instances.CONTENT_URI.buildUpon();
        android.content.ContentUris.appendId(uriBuilder, now);
        android.content.ContentUris.appendId(uriBuilder, rangeEnd);

        StringBuilder selection = new StringBuilder();
        selection.append(CalendarContract.Instances.CALENDAR_ID).append(" IN (");
        String[] selectionArgs = new String[selectedCalendarIds.size()];
        int index = 0;
        for (String calendarId : selectedCalendarIds) {
            if (index > 0) selection.append(",");
            selection.append("?");
            selectionArgs[index++] = calendarId;
        }
        selection.append(")");

        String[] projection = {
                CalendarContract.Instances.TITLE,
                CalendarContract.Instances.BEGIN,
                CalendarContract.Instances.END,
                CalendarContract.Instances.ALL_DAY,
        };
        ContentResolver resolver = context.getContentResolver();
        try (Cursor cursor = resolver.query(
                uriBuilder.build(),
                projection,
                selection.toString(),
                selectionArgs,
                CalendarContract.Instances.BEGIN + " ASC"
        )) {
            if (cursor == null) return;
            while (cursor.moveToNext()) {
                String title = cursor.getString(0);
                long begin = cursor.getLong(1);
                long end = cursor.getLong(2);
                boolean allDay = cursor.getInt(3) == 1;
                long effectiveEnd = end > 0 ? end : begin;
                if (effectiveEnd < now || begin > rangeEnd) continue;
                if (title == null || title.isEmpty()) {
                    title = context.getString(R.string.widget_untitled);
                }
                result.add(new WidgetEvent(title, begin, allDay));
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to read device calendar events", e);
        }
    }

    static boolean showsDayHeading(List<WidgetEvent> events, int index) {
        Calendar today = Calendar.getInstance();
        Calendar event = Calendar.getInstance();
        event.setTimeInMillis(events.get(index).displayBegin);
        if (isSameDay(today, event)) return false;
        if (index == 0) return true;

        Calendar previous = Calendar.getInstance();
        previous.setTimeInMillis(events.get(index - 1).displayBegin);
        return !isSameDay(previous, event);
    }

    static String formatDayHeading(long beginMs) {
        Locale locale = Locale.getDefault();
        return new SimpleDateFormat("EEEE, MMMM d", locale)
                .format(new Date(beginMs))
                .toUpperCase(locale);
    }

    // -------------------------------------------------------------------------
    // Time formatting
    // -------------------------------------------------------------------------

    static String formatEventTime(Context context, WidgetEvent widgetEvent) {
        long beginMs = widgetEvent.displayBegin;
        if (beginMs == 0) return "";

        return widgetEvent.allDay
                ? context.getString(R.string.widget_all_day)
                : new SimpleDateFormat("h:mm a", Locale.getDefault()).format(new Date(beginMs));
    }

    private static boolean isSameDay(Calendar a, Calendar b) {
        return a.get(Calendar.YEAR) == b.get(Calendar.YEAR)
                && a.get(Calendar.DAY_OF_YEAR) == b.get(Calendar.DAY_OF_YEAR);
    }

    private static long sevenDayRangeEnd(long now) {
        Calendar end = Calendar.getInstance();
        end.setTimeInMillis(now);
        end.set(Calendar.HOUR_OF_DAY, 0);
        end.set(Calendar.MINUTE, 0);
        end.set(Calendar.SECOND, 0);
        end.set(Calendar.MILLISECOND, 0);
        end.add(Calendar.DAY_OF_YEAR, 7);
        return end.getTimeInMillis() - 1;
    }
}
