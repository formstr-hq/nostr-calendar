package app.formstr.calendar;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

final class CalendarWidgetPreferences {

    private static final String PREFS_NAME = "CalendarWidgetPreferences";
    private static final String CONFIGURED_PREFIX = "configured_";
    private static final String NOSTR_CALENDARS_PREFIX = "nostr_calendars_";
    private static final String DEVICE_CALENDARS_PREFIX = "device_calendars_";

    private CalendarWidgetPreferences() {}

    static boolean isConfigured(Context context, int appWidgetId) {
        return preferences(context).getBoolean(CONFIGURED_PREFIX + appWidgetId, false);
    }

    static Set<String> getNostrCalendarIds(Context context, int appWidgetId) {
        return getStringSet(context, NOSTR_CALENDARS_PREFIX + appWidgetId);
    }

    static Set<String> getDeviceCalendarIds(Context context, int appWidgetId) {
        return getStringSet(context, DEVICE_CALENDARS_PREFIX + appWidgetId);
    }

    static void save(
            Context context,
            int appWidgetId,
            Set<String> nostrCalendarIds,
            Set<String> deviceCalendarIds
    ) {
        preferences(context).edit()
                .putStringSet(NOSTR_CALENDARS_PREFIX + appWidgetId, new HashSet<>(nostrCalendarIds))
                .putStringSet(DEVICE_CALENDARS_PREFIX + appWidgetId, new HashSet<>(deviceCalendarIds))
                .putBoolean(CONFIGURED_PREFIX + appWidgetId, true)
                .apply();
    }

    static void delete(Context context, int appWidgetId) {
        preferences(context).edit()
                .remove(CONFIGURED_PREFIX + appWidgetId)
                .remove(NOSTR_CALENDARS_PREFIX + appWidgetId)
                .remove(DEVICE_CALENDARS_PREFIX + appWidgetId)
                .apply();
    }

    private static Set<String> getStringSet(Context context, String key) {
        Set<String> stored = preferences(context).getStringSet(key, Collections.emptySet());
        return stored == null ? new HashSet<>() : new HashSet<>(stored);
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }
}
