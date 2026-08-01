package app.formstr.calendar;

import android.Manifest;
import android.appwidget.AppWidgetManager;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.os.Bundle;
import android.provider.CalendarContract;
import android.view.View;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

public class CalendarWidgetConfigureActivity extends AppCompatActivity {

    private static final String CAPACITOR_PREFS_NAME = "CapacitorStorage";
    private static final String NOSTR_CALENDARS_KEY = "cal:calendar_lists";

    private final Map<CheckBox, String> nostrChoices = new LinkedHashMap<>();
    private final Map<CheckBox, String> deviceChoices = new LinkedHashMap<>();
    private int appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        setResult(RESULT_CANCELED);
        appWidgetId = getIntent().getIntExtra(
                AppWidgetManager.EXTRA_APPWIDGET_ID,
                AppWidgetManager.INVALID_APPWIDGET_ID
        );
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }

        setContentView(R.layout.activity_calendar_widget_configure);
        bindCalendarChoices();

        findViewById(R.id.widget_config_cancel).setOnClickListener(view -> finish());
        findViewById(R.id.widget_config_save).setOnClickListener(view -> saveAndFinish());
    }

    private void bindCalendarChoices() {
        boolean configured = CalendarWidgetPreferences.isConfigured(this, appWidgetId);
        Set<String> selectedNostr = CalendarWidgetPreferences.getNostrCalendarIds(this, appWidgetId);
        Set<String> selectedDevice = CalendarWidgetPreferences.getDeviceCalendarIds(this, appWidgetId);

        LinearLayout nostrContainer = findViewById(R.id.widget_config_nostr_calendars);
        int nostrCount = bindNostrCalendars(nostrContainer, configured, selectedNostr);
        findViewById(R.id.widget_config_nostr_empty).setVisibility(
                nostrCount == 0 ? View.VISIBLE : View.GONE
        );

        LinearLayout deviceContainer = findViewById(R.id.widget_config_device_calendars);
        TextView deviceStatus = findViewById(R.id.widget_config_device_status);
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CALENDAR)
                != PackageManager.PERMISSION_GRANTED) {
            deviceStatus.setText(R.string.widget_config_device_permission_required);
            deviceStatus.setVisibility(View.VISIBLE);
            return;
        }

        int deviceCount = bindDeviceCalendars(deviceContainer, configured, selectedDevice);
        if (deviceCount == 0) {
            deviceStatus.setText(R.string.widget_config_no_device_calendars);
            deviceStatus.setVisibility(View.VISIBLE);
        }
    }

    private int bindNostrCalendars(
            LinearLayout container,
            boolean configured,
            Set<String> selectedIds
    ) {
        SharedPreferences preferences = getSharedPreferences(CAPACITOR_PREFS_NAME, Context.MODE_PRIVATE);
        String json = preferences.getString(NOSTR_CALENDARS_KEY, null);
        if (json == null || json.isEmpty()) return 0;

        Set<String> seenIds = new HashSet<>();
        try {
            JSONArray calendars = new JSONArray(json);
            for (int index = 0; index < calendars.length(); index++) {
                JSONObject calendar = calendars.optJSONObject(index);
                if (calendar == null) continue;
                String id = calendar.optString("id", "");
                if (id.isEmpty() || !seenIds.add(id)) continue;
                String title = calendar.optString("title", getString(R.string.widget_untitled));
                addChoice(container, nostrChoices, id, title, !configured || selectedIds.contains(id));
            }
        } catch (Exception ignored) {
            return 0;
        }
        return nostrChoices.size();
    }

    private int bindDeviceCalendars(
            LinearLayout container,
            boolean configured,
            Set<String> selectedIds
    ) {
        String[] projection = {
                CalendarContract.Calendars._ID,
                CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
                CalendarContract.Calendars.ACCOUNT_NAME,
        };
        String selection = CalendarContract.Calendars.VISIBLE + " = 1 AND "
                + CalendarContract.Calendars.SYNC_EVENTS + " = 1";
        ContentResolver resolver = getContentResolver();

        try (Cursor cursor = resolver.query(
                CalendarContract.Calendars.CONTENT_URI,
                projection,
                selection,
                null,
                CalendarContract.Calendars.CALENDAR_DISPLAY_NAME + " ASC"
        )) {
            if (cursor == null) return 0;
            while (cursor.moveToNext()) {
                String id = String.valueOf(cursor.getLong(0));
                String title = cursor.getString(1);
                String account = cursor.getString(2);
                if (title == null || title.isEmpty()) title = getString(R.string.widget_untitled);
                String label = account == null || account.isEmpty()
                        ? title
                        : getString(R.string.widget_config_device_calendar_label, title, account);
                addChoice(container, deviceChoices, id, label, !configured || selectedIds.contains(id));
            }
        } catch (SecurityException ignored) {
            return 0;
        }
        return deviceChoices.size();
    }

    private void addChoice(
            LinearLayout container,
            Map<CheckBox, String> choices,
            String id,
            String label,
            boolean checked
    ) {
        CheckBox checkBox = new CheckBox(this);
        checkBox.setText(label);
        checkBox.setChecked(checked);
        checkBox.setMinHeight(getResources().getDimensionPixelSize(R.dimen.widget_config_choice_min_height));
        container.addView(checkBox);
        choices.put(checkBox, id);
    }

    private void saveAndFinish() {
        Set<String> selectedNostr = collectSelected(nostrChoices);
        Set<String> selectedDevice = collectSelected(deviceChoices);
        CalendarWidgetPreferences.save(this, appWidgetId, selectedNostr, selectedDevice);

        AppWidgetManager manager = AppWidgetManager.getInstance(this);
        CalendarWidget.updateAppWidget(this, manager, appWidgetId);

        Intent result = new Intent();
        result.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        setResult(RESULT_OK, result);
        finish();
    }

    private static Set<String> collectSelected(Map<CheckBox, String> choices) {
        Set<String> selected = new HashSet<>();
        for (Map.Entry<CheckBox, String> choice : choices.entrySet()) {
            if (choice.getKey().isChecked()) selected.add(choice.getValue());
        }
        return selected;
    }
}
