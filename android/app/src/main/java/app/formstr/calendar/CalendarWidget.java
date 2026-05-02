package app.formstr.calendar;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class CalendarWidget extends AppWidgetProvider {

    private static final String TAG = "CalendarWidget";
    private static final String PREFS_NAME = "CapacitorStorage";
    private static final String EVENTS_KEY = "cal:events";
    private static final int MAX_EVENTS = 3;
    private static final long WIDGET_LOOKAHEAD_MS = 365L * 24 * 60 * 60 * 1000;

    private static final class WidgetEvent {
        final JSONObject event;
        final long displayBegin;

        WidgetEvent(JSONObject event, long displayBegin) {
            this.event = event;
            this.displayBegin = displayBegin;
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
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

            // Date header: day name (small) + date (large)
            Date now = new Date();
            views.setTextViewText(R.id.widget_day_name,
                    new SimpleDateFormat("EEEE", Locale.getDefault()).format(now));
            views.setTextViewText(R.id.widget_date,
                    new SimpleDateFormat("MMMM d", Locale.getDefault()).format(now));

            // Load and display upcoming events
            List<WidgetEvent> events = getUpcomingEvents(context);
            populateEvents(views, events);

            appWidgetManager.updateAppWidget(appWidgetId, views);
        } catch (Exception e) {
            Log.e(TAG, "Failed to update widget", e);
        }
    }

    // -------------------------------------------------------------------------
    // Event loading
    // -------------------------------------------------------------------------

    private static List<WidgetEvent> getUpcomingEvents(Context context) {
        List<WidgetEvent> result = new ArrayList<>();
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String eventsJson = prefs.getString(EVENTS_KEY, null);
            if (eventsJson == null || eventsJson.isEmpty()) {
                return result;
            }

            JSONArray all = new JSONArray(eventsJson);
            long now = System.currentTimeMillis();

            for (int i = 0; i < all.length(); i++) {
                JSONObject event = all.getJSONObject(i);
                long begin = event.optLong("begin", 0);
                long end = event.optLong("end", 0);
                long duration = Math.max(0L, end - begin);

                JSONObject repeat = event.optJSONObject("repeat");
                String rrule = (repeat != null && !repeat.isNull("rrule"))
                        ? repeat.optString("rrule", "")
                        : "";

                if (rrule != null && !rrule.isEmpty()) {
                    long searchStart = Math.max(begin, now - duration);
                    long searchEnd = now + WIDGET_LOOKAHEAD_MS;
                    long nextOccurrence = RecurrenceUtils.getNextOccurrenceInRange(
                            begin,
                            end,
                            rrule,
                            searchStart,
                            searchEnd
                    );
                    if (nextOccurrence >= 0) {
                        result.add(new WidgetEvent(event, nextOccurrence));
                    }
                    continue;
                }

                // Keep events that have not fully ended yet
                long effectiveEnd = end > 0 ? end : begin;
                if (effectiveEnd >= now) {
                    result.add(new WidgetEvent(event, begin));
                }
            }

            // Sort ascending by display time (next occurrence for recurring events)
            result.sort((a, b) -> Long.compare(a.displayBegin, b.displayBegin));

            return result.subList(0, Math.min(MAX_EVENTS, result.size()));
        } catch (JSONException e) {
            Log.e(TAG, "Failed to parse cached events", e);
            return result;
        }
    }

    // -------------------------------------------------------------------------
    // View population
    // -------------------------------------------------------------------------

    private static final int[] ROW_IDS   = {R.id.widget_event_row_1, R.id.widget_event_row_2, R.id.widget_event_row_3};
    private static final int[] TIME_IDS  = {R.id.widget_time_1,      R.id.widget_time_2,      R.id.widget_time_3};
    private static final int[] TITLE_IDS = {R.id.widget_title_1,     R.id.widget_title_2,     R.id.widget_title_3};

    private static void populateEvents(RemoteViews views, List<WidgetEvent> events) {
        if (events.isEmpty()) {
            views.setViewVisibility(R.id.widget_empty, View.VISIBLE);
            for (int rowId : ROW_IDS) {
                views.setViewVisibility(rowId, View.GONE);
            }
            return;
        }

        views.setViewVisibility(R.id.widget_empty, View.GONE);

        for (int i = 0; i < MAX_EVENTS; i++) {
            if (i < events.size()) {
                WidgetEvent widgetEvent = events.get(i);
                long begin = widgetEvent.displayBegin;
                String title = widgetEvent.event.optString("title", "Untitled");

                views.setViewVisibility(ROW_IDS[i], View.VISIBLE);
                views.setTextViewText(TIME_IDS[i], formatEventTime(begin));
                views.setTextViewText(TITLE_IDS[i], title);
            } else {
                views.setViewVisibility(ROW_IDS[i], View.GONE);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Time formatting
    // -------------------------------------------------------------------------

    private static String formatEventTime(long beginMs) {
        if (beginMs == 0) return "";

        Calendar now = Calendar.getInstance();
        Calendar event = Calendar.getInstance();
        event.setTimeInMillis(beginMs);

        String time = new SimpleDateFormat("h:mm a", Locale.getDefault()).format(new Date(beginMs));

        if (isSameDay(now, event)) {
            return time;
        } else if (isTomorrow(now, event)) {
            return "Tomorrow";
        } else {
            return new SimpleDateFormat("EEE", Locale.getDefault()).format(new Date(beginMs));
        }
    }

    private static boolean isSameDay(Calendar a, Calendar b) {
        return a.get(Calendar.YEAR) == b.get(Calendar.YEAR)
                && a.get(Calendar.DAY_OF_YEAR) == b.get(Calendar.DAY_OF_YEAR);
    }

    private static boolean isTomorrow(Calendar now, Calendar event) {
        Calendar tomorrow = (Calendar) now.clone();
        tomorrow.add(Calendar.DAY_OF_YEAR, 1);
        return isSameDay(tomorrow, event);
    }
}
