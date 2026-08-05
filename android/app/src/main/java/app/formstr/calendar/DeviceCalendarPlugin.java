package app.formstr.calendar;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;
import android.text.TextUtils;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONException;

import java.util.Locale;

/**
 * Bridges the device's calendar database to the JS layer. Read and write.
 */
@CapacitorPlugin(
        name = "DeviceCalendar",
        permissions = {
                @Permission(
                        alias = DeviceCalendarPlugin.PERM_ALIAS,
                        strings = {
                                Manifest.permission.READ_CALENDAR,
                                Manifest.permission.WRITE_CALENDAR
                        }
                )
        }
)
public class DeviceCalendarPlugin extends Plugin {

    private static final String TAG = "DeviceCalendarPlugin";
    static final String PERM_ALIAS = "calendar";

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        call.resolve(buildPermissionStatus());
    }

    @Override
    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (currentPermissionState() == PermissionState.GRANTED) {
            call.resolve(buildPermissionStatus());
            return;
        }
        requestPermissionForAlias(PERM_ALIAS, call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        call.resolve(buildPermissionStatus());
    }

    @PluginMethod
    public void listCalendars(PluginCall call) {
        if (currentPermissionState() != PermissionState.GRANTED) {
            call.reject("Calendar permission not granted");
            return;
        }

        JSArray calendars = new JSArray();
        String[] projection = new String[]{
                CalendarContract.Calendars._ID,
                CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
                CalendarContract.Calendars.ACCOUNT_NAME,
                CalendarContract.Calendars.CALENDAR_COLOR,
                CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL,
                CalendarContract.Calendars.IS_PRIMARY,
                CalendarContract.Calendars.OWNER_ACCOUNT,
        };

        ContentResolver resolver = getContext().getContentResolver();
        // Only surface calendars the user has chosen to show in the system
        // Calendar app and that are actively syncing events. This drops
        // Classroom-style auto-synced calendars the user never opted in to.
        String selection = CalendarContract.Calendars.VISIBLE + " = 1 AND "
                + CalendarContract.Calendars.SYNC_EVENTS + " = 1";
        try (Cursor cursor = resolver.query(
                CalendarContract.Calendars.CONTENT_URI,
                projection,
                selection,
                null,
                CalendarContract.Calendars.CALENDAR_DISPLAY_NAME + " ASC")) {
            if (cursor == null) {
                call.resolve(new JSObject().put("calendars", calendars));
                return;
            }
            while (cursor.moveToNext()) {
                long id = cursor.getLong(0);
                String name = cursor.getString(1);
                String accountName = cursor.getString(2);
                int color = cursor.getInt(3);
                int accessLevel = cursor.getInt(4);
                boolean isPrimary = !cursor.isNull(5) && cursor.getInt(5) == 1;

                JSObject obj = new JSObject();
                obj.put("id", String.valueOf(id));
                obj.put("name", TextUtils.isEmpty(name) ? "" : name);
                obj.put("accountName", accountName == null ? "" : accountName);
                obj.put("color", colorIntToHex(color));
                obj.put("isPrimary", isPrimary);
                obj.put("canWrite", accessLevel >= CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR);
                calendars.put(obj);
            }
        } catch (Exception e) {
            Log.e(TAG, "listCalendars failed", e);
            call.reject("Failed to read calendars: " + e.getMessage());
            return;
        }

        JSObject result = new JSObject();
        result.put("calendars", calendars);
        call.resolve(result);
    }

    @PluginMethod
    public void listEvents(PluginCall call) {
        if (currentPermissionState() != PermissionState.GRANTED) {
            call.reject("Calendar permission not granted");
            return;
        }

        Long startMs = call.getLong("startMs");
        Long endMs = call.getLong("endMs");
        if (startMs == null || endMs == null || endMs <= startMs) {
            call.reject("startMs and endMs are required, and endMs must be > startMs");
            return;
        }

        JSArray calendarIdsArray = call.getArray("calendarIds", new JSArray());
        String filterClause = null;
        try {
            if (calendarIdsArray != null && calendarIdsArray.length() > 0) {
                StringBuilder sb = new StringBuilder();
                sb.append(CalendarContract.Instances.CALENDAR_ID).append(" IN (");
                for (int i = 0; i < calendarIdsArray.length(); i++) {
                    if (i > 0) sb.append(",");
                    // Casting to long sanitizes the input.
                    sb.append(Long.parseLong(calendarIdsArray.getString(i)));
                }
                sb.append(")");
                filterClause = sb.toString();
            }
        } catch (JSONException | NumberFormatException e) {
            call.reject("Invalid calendarIds payload");
            return;
        }

        // Use the Instances table so the OS expands recurring events for us.
        Uri.Builder builder = CalendarContract.Instances.CONTENT_URI.buildUpon();
        ContentUris.appendId(builder, startMs);
        ContentUris.appendId(builder, endMs);

        String[] projection = new String[]{
                CalendarContract.Instances._ID,
                CalendarContract.Instances.EVENT_ID,
                CalendarContract.Instances.CALENDAR_ID,
                CalendarContract.Instances.TITLE,
                CalendarContract.Instances.DESCRIPTION,
                CalendarContract.Instances.EVENT_LOCATION,
                CalendarContract.Instances.BEGIN,
                CalendarContract.Instances.END,
                CalendarContract.Instances.ALL_DAY,
                CalendarContract.Instances.ORGANIZER,
                CalendarContract.Instances.RRULE,
        };

        JSArray events = new JSArray();
        ContentResolver resolver = getContext().getContentResolver();
        try (Cursor cursor = resolver.query(
                builder.build(),
                projection,
                filterClause,
                null,
                CalendarContract.Instances.BEGIN + " ASC")) {
            if (cursor == null) {
                call.resolve(new JSObject().put("events", events));
                return;
            }
            while (cursor.moveToNext()) {
                long instanceId = cursor.getLong(0);
                long eventId = cursor.getLong(1);
                long calendarId = cursor.getLong(2);
                String title = cursor.getString(3);
                String description = cursor.getString(4);
                String location = cursor.getString(5);
                long begin = cursor.getLong(6);
                long end = cursor.getLong(7);
                boolean allDay = cursor.getInt(8) == 1;
                String organizer = cursor.getString(9);
                String rrule = cursor.getString(10);

                JSObject obj = new JSObject();
                // Combine instance + event id so duplicate occurrences of the same recurring
                // event remain distinct as React render keys. Every write/delete must parse
                // out the eventId half via parseEventId() and operate on Events, never Instances.
                obj.put("id", instanceId + ":" + eventId);
                obj.put("calendarId", String.valueOf(calendarId));
                obj.put("title", title == null ? "" : title);
                obj.put("description", description == null ? "" : description);
                obj.put("location", location == null ? "" : location);
                obj.put("beginMs", begin);
                obj.put("endMs", end);
                obj.put("allDay", allDay);
                obj.put("organizer", organizer == null ? "" : organizer);
                if (!TextUtils.isEmpty(rrule)) {
                    obj.put("rrule", rrule);
                }
                events.put(obj);
            }
        } catch (Exception e) {
            Log.e(TAG, "listEvents failed", e);
            call.reject("Failed to read events: " + e.getMessage());
            return;
        }

        JSObject result = new JSObject();
        result.put("events", events);
        call.resolve(result);
    }

    @PluginMethod
    public void createEvent(PluginCall call) {
        if (currentPermissionState() != PermissionState.GRANTED) {
            call.reject("Calendar permission not granted");
            return;
        }

        Long calendarId = parseLong(call.getString("calendarId"));
        String title = call.getString("title", "");
        String description = call.getString("description", "");
        String location = call.getString("location", "");
        Long beginMs = call.getLong("beginMs");
        Long endMs = call.getLong("endMs");
        Boolean allDay = call.getBoolean("allDay", false);
        String rrule = call.getString("rrule");

        if (calendarId == null || beginMs == null) {
            call.reject("calendarId and beginMs are required");
            return;
        }
        if (!TextUtils.isEmpty(rrule)) {
            // Android requires DURATION (not DTEND) whenever RRULE is set.
            if (endMs == null) {
                call.reject("endMs is required to compute a duration for recurring events");
                return;
            }
        } else if (endMs == null) {
            call.reject("endMs is required for non-recurring events");
            return;
        }

        ContentValues values = new ContentValues();
        values.put(CalendarContract.Events.CALENDAR_ID, calendarId);
        values.put(CalendarContract.Events.TITLE, title);
        values.put(CalendarContract.Events.DESCRIPTION, description);
        values.put(CalendarContract.Events.EVENT_LOCATION, location);
        values.put(CalendarContract.Events.ALL_DAY, Boolean.TRUE.equals(allDay) ? 1 : 0);
        values.put(CalendarContract.Events.EVENT_TIMEZONE, java.util.TimeZone.getDefault().getID());
        values.put(CalendarContract.Events.DTSTART, beginMs);

        if (!TextUtils.isEmpty(rrule)) {
            values.put(CalendarContract.Events.RRULE, rrule);
            values.put(CalendarContract.Events.DURATION, millisToDuration(endMs - beginMs));
        } else {
            values.put(CalendarContract.Events.DTEND, endMs);
        }

        ContentResolver resolver = getContext().getContentResolver();
        Uri result;
        try {
            result = resolver.insert(CalendarContract.Events.CONTENT_URI, values);
        } catch (Exception e) {
            Log.e(TAG, "createEvent failed", e);
            call.reject("Failed to create event: " + e.getMessage());
            return;
        }
        if (result == null) {
            call.reject("Failed to create event");
            return;
        }

        long eventId = ContentUris.parseId(result);
        JSObject response = new JSObject();
        response.put("eventId", String.valueOf(eventId));
        call.resolve(response);
    }

    @PluginMethod
    public void updateEvent(PluginCall call) {
        if (currentPermissionState() != PermissionState.GRANTED) {
            call.reject("Calendar permission not granted");
            return;
        }

        Long eventId = parseEventId(call.getString("id"));
        if (eventId == null) {
            call.reject("A valid event id is required");
            return;
        }

        ContentValues values = new ContentValues();
        if (call.getData().has("title")) {
            values.put(CalendarContract.Events.TITLE, call.getString("title", ""));
        }
        if (call.getData().has("description")) {
            values.put(CalendarContract.Events.DESCRIPTION, call.getString("description", ""));
        }
        if (call.getData().has("location")) {
            values.put(CalendarContract.Events.EVENT_LOCATION, call.getString("location", ""));
        }
        if (call.getData().has("allDay")) {
            values.put(CalendarContract.Events.ALL_DAY, Boolean.TRUE.equals(call.getBoolean("allDay")) ? 1 : 0);
        }

        Long beginMs = call.getLong("beginMs");
        Long endMs = call.getLong("endMs");
        String rrule = call.getString("rrule");
        boolean hasRrule = call.getData().has("rrule") && !TextUtils.isEmpty(rrule);

        if (beginMs != null) {
            values.put(CalendarContract.Events.DTSTART, beginMs);
        }
        if (hasRrule) {
            values.put(CalendarContract.Events.RRULE, rrule);
            if (beginMs != null && endMs != null) {
                // Recurring events use DURATION, never DTEND.
                values.putNull(CalendarContract.Events.DTEND);
                values.put(CalendarContract.Events.DURATION, millisToDuration(endMs - beginMs));
            }
        } else if (call.getData().has("rrule")) {
            // Explicitly clearing recurrence: switch back to DTEND.
            values.putNull(CalendarContract.Events.RRULE);
            values.putNull(CalendarContract.Events.DURATION);
            if (endMs != null) {
                values.put(CalendarContract.Events.DTEND, endMs);
            }
        } else if (endMs != null) {
            values.put(CalendarContract.Events.DTEND, endMs);
        }

        if (values.size() == 0) {
            call.resolve();
            return;
        }

        ContentResolver resolver = getContext().getContentResolver();
        Uri uri = ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, eventId);
        int rows;
        try {
            // Whole-series only: this updates the Events master row directly and never
            // touches Instances/exception rows, matching the v1 recurring-event scope.
            rows = resolver.update(uri, values, null, null);
        } catch (Exception e) {
            Log.e(TAG, "updateEvent failed", e);
            call.reject("Failed to update event: " + e.getMessage());
            return;
        }
        if (rows <= 0) {
            call.reject("Failed to update event: no matching event");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void deleteEvent(PluginCall call) {
        if (currentPermissionState() != PermissionState.GRANTED) {
            call.reject("Calendar permission not granted");
            return;
        }

        Long eventId = parseEventId(call.getString("id"));
        if (eventId == null) {
            call.reject("A valid event id is required");
            return;
        }

        ContentResolver resolver = getContext().getContentResolver();
        Uri uri = ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, eventId);
        int rows;
        try {
            // Deletes the whole series for recurring events, matching whole-series-only scope.
            rows = resolver.delete(uri, null, null);
        } catch (Exception e) {
            Log.e(TAG, "deleteEvent failed", e);
            call.reject("Failed to delete event: " + e.getMessage());
            return;
        }
        if (rows <= 0) {
            call.reject("Failed to delete event: no matching event");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void updateCalendarColor(PluginCall call) {
        if (currentPermissionState() != PermissionState.GRANTED) {
            call.reject("Calendar permission not granted");
            return;
        }

        Long calendarId = parseLong(call.getString("calendarId"));
        String hex = call.getString("color");
        if (calendarId == null || TextUtils.isEmpty(hex)) {
            call.reject("calendarId and color are required");
            return;
        }

        Integer colorInt = colorHexToInt(hex);
        if (colorInt == null) {
            call.reject("Invalid color");
            return;
        }

        // Only attempt the write when this calendar is writable at all (same
        // threshold listCalendars already uses for `canWrite`); some sync
        // adapters (notably some Google accounts) can silently revert a color
        // write on next sync regardless — that's what the JS-side override
        // fallback exists for. We don't try to verify the write "stuck" here,
        // since that would be inherently racy against the sync adapter.
        if (!canWriteCalendar(calendarId)) {
            JSObject response = new JSObject();
            response.put("applied", false);
            call.resolve(response);
            return;
        }

        ContentValues values = new ContentValues();
        values.put(CalendarContract.Calendars.CALENDAR_COLOR, colorInt);

        ContentResolver resolver = getContext().getContentResolver();
        Uri uri = ContentUris.withAppendedId(CalendarContract.Calendars.CONTENT_URI, calendarId);
        int rows;
        try {
            rows = resolver.update(uri, values, null, null);
        } catch (Exception e) {
            Log.e(TAG, "updateCalendarColor failed", e);
            JSObject response = new JSObject();
            response.put("applied", false);
            call.resolve(response);
            return;
        }

        JSObject response = new JSObject();
        response.put("applied", rows > 0);
        call.resolve(response);
    }

    private boolean canWriteCalendar(long calendarId) {
        ContentResolver resolver = getContext().getContentResolver();
        Uri uri = ContentUris.withAppendedId(CalendarContract.Calendars.CONTENT_URI, calendarId);
        String[] projection = new String[]{CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL};
        try (Cursor cursor = resolver.query(uri, projection, null, null, null)) {
            if (cursor == null || !cursor.moveToFirst()) return false;
            return cursor.getInt(0) >= CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR;
        } catch (Exception e) {
            Log.e(TAG, "canWriteCalendar failed", e);
            return false;
        }
    }

    private PermissionState currentPermissionState() {
        return getPermissionState(PERM_ALIAS);
    }

    private JSObject buildPermissionStatus() {
        JSObject status = new JSObject();
        status.put("calendar", capacitorStateString(currentPermissionState()));
        return status;
    }

    private static String capacitorStateString(PermissionState state) {
        if (state == null) return "prompt";
        switch (state) {
            case GRANTED: return "granted";
            case DENIED:  return "denied";
            case PROMPT_WITH_RATIONALE: return "prompt-with-rationale";
            case PROMPT:
            default: return "prompt";
        }
    }

    private static String colorIntToHex(int color) {
        // Strip alpha; calendar provider stores colors as ARGB ints.
        return String.format(Locale.US, "#%06X", color & 0xFFFFFF);
    }

    /** Inverse of {@link #colorIntToHex(int)}. Returns null for a malformed hex string. */
    private static Integer colorHexToInt(String hex) {
        String normalized = hex.startsWith("#") ? hex.substring(1) : hex;
        if (normalized.length() != 6) return null;
        try {
            return 0xFF000000 | (int) Long.parseLong(normalized, 16);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * `listEvents` returns composite ids of the form "instanceId:eventId" (Instances is a
     * regenerable cache). Every write/delete must operate on the real eventId against
     * CalendarContract.Events, never the instance id — fail loudly on anything else.
     */
    private static Long parseEventId(String compositeId) {
        if (TextUtils.isEmpty(compositeId)) return null;
        int separatorIndex = compositeId.lastIndexOf(':');
        String eventIdPart = separatorIndex >= 0
                ? compositeId.substring(separatorIndex + 1)
                : compositeId;
        return parseLong(eventIdPart);
    }

    private static Long parseLong(String value) {
        if (TextUtils.isEmpty(value)) return null;
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** RFC5545 DURATION string (e.g. "P1D", "PT30M") from a millisecond span. Required by
     * CalendarContract whenever RRULE is set, in place of DTEND. */
    private static String millisToDuration(long millis) {
        long totalSeconds = Math.max(0, millis / 1000L);
        if (totalSeconds % 86400 == 0) {
            return "P" + (totalSeconds / 86400) + "D";
        }
        return "PT" + totalSeconds + "S";
    }
}
