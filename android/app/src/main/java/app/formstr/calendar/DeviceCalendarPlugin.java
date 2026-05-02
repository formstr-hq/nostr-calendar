package app.formstr.calendar;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.database.Cursor;
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
 * Bridges the device's calendar database to the JS layer. Read-only.
 */
@CapacitorPlugin(
        name = "DeviceCalendar",
        permissions = {
                @Permission(
                        alias = DeviceCalendarPlugin.PERM_ALIAS,
                        strings = {
                                Manifest.permission.READ_CALENDAR
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
                // event remain distinct as React render keys.
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
}
