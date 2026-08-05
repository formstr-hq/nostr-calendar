package app.formstr.calendar;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.DateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import okhttp3.OkHttpClient;

/**
 * Polls cached replaceable calendar events while the WebView is absent.
 */
public class EventUpdateWorker extends Worker {
    private static final String TAG = "EventUpdateWorker";
    private static final String PREFS_NAME = "CapacitorStorage";
    private static final String EVENTS_KEY = "cal:events";
    private static final String RELAYS_KEY = "bg:relays";
    private static final String USER_KEY = "bg:userPubkey";
    private static final String CHANNEL_ID = "event_updates";
    private static final long RELAY_TIMEOUT_SECONDS = 15;
    private static final int MAX_RELAYS = 3;

    public EventUpdateWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Log.d(TAG, "Event update poll starting");
        try {
            Context context = getApplicationContext();
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            JSONArray events = new JSONArray(prefs.getString(EVENTS_KEY, "[]"));
            String currentUser = RelayQueryUtils.parseJsonString(prefs.getString(USER_KEY, ""));
            Log.d(TAG, "Loaded cached events. Count=" + events.length());
            if (currentUser == null || currentUser.isEmpty()) {
                Log.d(TAG, "No background user is configured; poll skipped");
                return Result.success();
            }
            Log.d(TAG, "Loaded background user");

            List<String> defaultRelays = readStrings(prefs.getString(RELAYS_KEY, "[]"));
            Log.d(TAG, "Loaded default relays. Count=" + defaultRelays.size());
            List<JSONObject> eligible = new ArrayList<>();
            for (int index = 0; index < events.length(); index++) {
                JSONObject cached = events.optJSONObject(index);
                if (isEligible(cached)) eligible.add(cached);
            }
            Log.d(TAG, "Selected eligible private events. Count=" + eligible.size());
            if (eligible.isEmpty()) {
                Log.d(TAG, "No eligible private events; poll finished");
                return Result.success();
            }

            Map<String, JSONObject> freshByCoordinate = new HashMap<>();
            Set<String> expectedCoordinates = new HashSet<>();
            for (JSONObject cached : eligible) expectedCoordinates.add(coordinate(cached));
            Log.d(TAG, "Built expected coordinate set. Count=" + expectedCoordinates.size());
            OkHttpClient client = RelayQueryUtils.createClient(RELAY_TIMEOUT_SECONDS);

            try {
                Log.d(TAG, "Starting relay queries");
                queryLatest(client, eligible, defaultRelays, expectedCoordinates, freshByCoordinate);
            } finally {
                RelayQueryUtils.shutdownClient(client);
                Log.d(TAG, "Relay client shut down");
            }
            Log.d(TAG, "Relay queries finished. Latest replacements=" + freshByCoordinate.size());

            boolean changed = false;
            boolean rescheduleReminders = false;
            int acceptedUpdates = 0;
            List<PendingUpdate> notifications = new ArrayList<>();
            for (int index = 0; index < events.length(); index++) {
                JSONObject cached = events.optJSONObject(index);
                if (!isEligible(cached)) continue;
                String eventCoordinate = coordinate(cached);
                JSONObject fresh = freshByCoordinate.get(eventCoordinate);
                if (fresh == null) {
                    Log.d(TAG, "No relay replacement for " + eventCoordinate);
                    continue;
                }
                if (fresh.optLong("created_at") <= cached.optLong("createdAt")) {
                    Log.d(TAG, "Relay replacement is not newer for " + eventCoordinate
                            + ". Cached createdAt=" + cached.optLong("createdAt")
                            + ", relay created_at=" + fresh.optLong("created_at"));
                    continue;
                }

                Log.d(TAG, "Decrypting newer replacement for " + eventCoordinate);
                JSONObject updated = parsePrivateEvent(fresh, cached);
                if (updated == null) {
                    Log.d(TAG, "Replacement could not be parsed for " + eventCoordinate);
                    continue;
                }
                UpdateSummary summary = compare(cached, updated);
                Log.d(TAG, "Compared replacement for " + eventCoordinate + ". Changed=" + summary.changed);
                events.put(index, updated);
                changed = true;
                acceptedUpdates++;
                rescheduleReminders |= summary.scheduleChanged;
                if (shouldNotify(cached, updated, currentUser, summary)) {
                    notifications.add(new PendingUpdate(updated, summary.body));
                    Log.d(TAG, "Queued update notification for " + eventCoordinate);
                } else {
                    Log.d(TAG, "Update notification suppressed for " + eventCoordinate);
                }
            }

            if (changed) {
                Log.d(TAG, "Persisting accepted replacements. Count=" + acceptedUpdates);
                if (!prefs.edit().putString(EVENTS_KEY, events.toString()).commit()) {
                    Log.w(TAG, "Failed to persist accepted replacements; retrying worker");
                    return Result.retry();
                }
                Log.d(TAG, "Accepted replacements persisted");
                CalendarWidget.refreshAll(context);
                Log.d(TAG, "Calendar widgets refreshed");
                if (rescheduleReminders) {
                    NotificationWorker.enqueueImmediate(context);
                    Log.d(TAG, "Reminder reconciliation enqueued");
                } else {
                    Log.d(TAG, "Reminder reconciliation not required");
                }
                Log.d(TAG, "Posting update notifications. Count=" + notifications.size());
                for (PendingUpdate notification : notifications) {
                    postUpdate(context, notification.event, notification.body);
                }
            } else {
                Log.d(TAG, "No newer valid replacements were accepted");
            }
            Log.d(TAG, "Event update poll finished. Accepted=" + acceptedUpdates
                    + ", notifications=" + notifications.size());
            return Result.success();
        } catch (Exception error) {
            Log.w(TAG, "Event update poll failed", error);
            return Result.retry();
        }
    }

    private void queryLatest(OkHttpClient client, List<JSONObject> events, List<String> defaults,
                             Set<String> expectedCoordinates, Map<String, JSONObject> latest) {
        Set<String> relaySet = new LinkedHashSet<>();
        for (JSONObject event : events) {
            String hint = event.optString("relayHint", "");
            if (!hint.isEmpty()) relaySet.add(hint);
        }
        relaySet.addAll(defaults);
        List<String> relays = new ArrayList<>(relaySet);
        JSONArray filters = buildFilters(events);
        Log.d(TAG, "Prepared relay query. Candidate relays=" + relays.size()
                + ", filters=" + filters.length());
        if (filters.length() == 0) {
            Log.d(TAG, "No valid filters could be built; relay queries skipped");
            return;
        }
        if (relays.isEmpty()) {
            Log.d(TAG, "No relay URLs are available; relay queries skipped");
            return;
        }
        for (int index = 0; index < Math.min(MAX_RELAYS, relays.size()); index++) {
            String relay = relays.get(index);
            int knownBefore = latest.size();
            Log.d(TAG, "Querying relay " + (index + 1) + "/" + Math.min(MAX_RELAYS, relays.size())
                    + ": " + relay);
            RelayQueryUtils.queryEvents(client, relay, "event_update", filters,
                    RELAY_TIMEOUT_SECONDS, TAG, event -> {
                        String eventCoordinate = coordinate(event);
                        if (!expectedCoordinates.contains(eventCoordinate)) {
                            Log.d(TAG, "Ignoring unexpected relay coordinate " + eventCoordinate);
                            return;
                        }
                        JSONObject known = latest.get(eventCoordinate);
                        if (known == null || event.optLong("created_at") > known.optLong("created_at")) {
                            latest.put(eventCoordinate, event);
                            Log.d(TAG, "Retained relay replacement for " + eventCoordinate);
                        }
                    });
            Log.d(TAG, "Relay query finished: " + relay + ". New latest replacements="
                    + (latest.size() - knownBefore));
        }
    }

    private static JSONArray buildFilters(List<JSONObject> events) {
        Map<String, JSONObject> grouped = new LinkedHashMap<>();
        for (JSONObject event : events) {
            int kind = event.optInt("kind");
            String author = event.optString("user");
            String identifier = event.optString("id");
            if (kind == 0 || author.isEmpty() || identifier.isEmpty()) continue;
            String groupKey = kind + ":" + author;
            try {
                JSONObject filter = grouped.get(groupKey);
                if (filter == null) {
                    filter = new JSONObject()
                            .put("kinds", new JSONArray().put(kind))
                            .put("authors", new JSONArray().put(author))
                            .put("#d", new JSONArray());
                    grouped.put(groupKey, filter);
                }
                filter.getJSONArray("#d").put(identifier);
            } catch (Exception ignored) {}
        }
        JSONArray filters = new JSONArray();
        for (JSONObject filter : grouped.values()) filters.put(filter);
        return filters;
    }

    private static boolean isEligible(JSONObject event) {
        if (event == null || !event.optBoolean("isPrivateEvent") || "device".equals(event.optString("source"))
                || event.optBoolean("isInvitation") || event.optString("viewKey").isEmpty()) return false;
        String id = event.optString("id");
        String author = event.optString("user");
        String rrule = event.optJSONObject("repeat") == null ? ""
                : event.optJSONObject("repeat").optString("rrule");
        return !id.isEmpty() && !author.isEmpty() && (event.optLong("end") > System.currentTimeMillis()
                || !rrule.isEmpty());
    }

    private static String coordinate(JSONObject event) {
        String dTag = event.optString("id");
        if (event.has("tags")) dTag = tag(event.optJSONArray("tags"), "d");
        return event.optInt("kind") + ":" + event.optString("pubkey", event.optString("user")) + ":" + dTag;
    }

    private static JSONObject parsePrivateEvent(JSONObject event, JSONObject cached) {
        try {
            JSONArray tags = new JSONArray(Nip44.decrypt(cached.getString("viewKey"), event.getString("content")));
            JSONObject parsed = new JSONObject(cached.toString());
            parsed.put("eventId", event.getString("id"));
            parsed.put("createdAt", event.getLong("created_at"));
            parsed.put("kind", event.getInt("kind"));
            parsed.put("user", event.getString("pubkey"));
            parsed.put("id", tag(tags, "d"));
            parsed.put("title", firstTag(tags, "title", "name"));
            parsed.put("description", tag(tags, "description"));
            parsed.put("begin", secondsToMillis(tag(tags, "start")));
            parsed.put("end", secondsToMillis(tag(tags, "end")));
            parsed.put("allDay", isAllDay(parsed.optLong("begin"), parsed.optLong("end")));
            parsed.put("image", tag(tags, "image"));
            parsed.put("location", tagsFor(tags, "location"));
            parsed.put("participants", tagsFor(tags, "p"));
            parsed.put("categories", tagsFor(tags, "t"));
            parsed.put("reference", tagsFor(tags, "r"));
            parsed.put("forms", formsFor(tags));
            String rrule = recurrenceRule(tags);
            parsed.put("repeat", new JSONObject().put("rrule", rrule.isEmpty() ? JSONObject.NULL : rrule));
            String notificationPreference = tag(tags, "notification");
            if ("enabled".equals(notificationPreference) || "disabled".equals(notificationPreference)) {
                parsed.put("notificationPreference", notificationPreference);
            } else {
                parsed.remove("notificationPreference");
            }
            if (parsed.optLong("begin") <= 0 || parsed.optLong("end") <= 0) {
                Log.w(TAG, "Decrypted event update has invalid start or end time");
                return null;
            }
            Log.d(TAG, "Private event replacement decrypted and parsed");
            return parsed;
        } catch (Exception error) {
            Log.w(TAG, "Failed to decrypt private event update", error);
            return null;
        }
    }

    private static UpdateSummary compare(JSONObject previous, JSONObject fresh) {
        List<String> changed = new ArrayList<>();
        boolean timeChanged = previous.optLong("begin") != fresh.optLong("begin")
                || previous.optLong("end") != fresh.optLong("end");
        if (timeChanged) changed.add("date and time");
        compareValue(previous, fresh, "title", "title", changed);
        compareValue(previous, fresh, "description", "description", changed);
        compareArray(previous, fresh, "location", "location", changed);
        compareValue(previous, fresh, "image", "image", changed);
        boolean recurrenceChanged = !repeatRule(previous).equals(repeatRule(fresh));
        if (recurrenceChanged) changed.add("recurrence");
        compareArray(previous, fresh, "categories", "categories", changed);
        compareArray(previous, fresh, "reference", "references", changed);
        if (!formSet(previous.optJSONArray("forms")).equals(formSet(fresh.optJSONArray("forms")))) {
            changed.add("forms");
        }
        boolean notificationPreferenceChanged = !previous.optString("notificationPreference")
                .equals(fresh.optString("notificationPreference"));
        if (notificationPreferenceChanged) changed.add("notification preference");
        Set<String> oldParticipants = set(previous.optJSONArray("participants"));
        Set<String> newParticipants = set(fresh.optJSONArray("participants"));
        newParticipants.removeAll(oldParticipants);
        if (!newParticipants.isEmpty()) changed.add("participants");
        String body = timeChanged ? "New time: " + formatRange(fresh.optLong("begin"), fresh.optLong("end"))
                : newParticipants.size() > 0 && changed.size() == 1
                ? newParticipants.size() == 1 ? "A participant was added"
                : newParticipants.size() + " participants were added"
                : changed.isEmpty() ? "" : "Updated: " + android.text.TextUtils.join(", ", changed);
        return new UpdateSummary(changed, timeChanged,
                timeChanged || recurrenceChanged || notificationPreferenceChanged, body);
    }

    private static boolean shouldNotify(JSONObject previous, JSONObject fresh, String currentUser, UpdateSummary summary) {
        String eventCoordinate = coordinate(fresh);
        if (summary.changed.isEmpty()) {
            Log.d(TAG, "Notification skipped because no alertable attributes changed for " + eventCoordinate);
            return false;
        }
        if (currentUser == null || currentUser.isEmpty()) {
            Log.d(TAG, "Notification skipped because no current user is available for " + eventCoordinate);
            return false;
        }
        if (fresh.optString("user").equalsIgnoreCase(currentUser)) {
            Log.d(TAG, "Notification skipped because the current user authored " + eventCoordinate);
            return false;
        }
        Set<String> oldParticipants = set(previous.optJSONArray("participants"));
        Set<String> newParticipants = set(fresh.optJSONArray("participants"));
        if (oldParticipants.contains(currentUser.toLowerCase())
                && !newParticipants.contains(currentUser.toLowerCase())) {
            Log.d(TAG, "Notification skipped because the current user was removed from " + eventCoordinate);
            return false;
        }
        Log.d(TAG, "Notification is allowed for " + eventCoordinate);
        return true;
    }

    private static void postUpdate(Context context, JSONObject event, String body) {
        String eventCoordinate = coordinate(event);
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context,
                Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            Log.d(TAG, "Notification permission is not granted; skipped " + eventCoordinate);
            return;
        }
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            Log.w(TAG, "Notification manager unavailable; skipped " + eventCoordinate);
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Event updates", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Notifications when calendar events are updated");
            manager.createNotificationChannel(channel);
            Log.d(TAG, "Created event updates notification channel");
        }
        String key = "event-update:" + event.optInt("kind") + ":" + event.optString("user") + ":"
                + event.optString("id") + ":" + event.optString("eventId");
        Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (intent != null) intent.putExtra("openRoute", "/notification-event/" + event.optString("id"));
        PendingIntent pending = intent == null ? null : PendingIntent.getActivity(context, key.hashCode(), intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder notification = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(context.getResources().getIdentifier("ic_notification", "drawable", context.getPackageName()))
                .setContentTitle(event.optString("title", "Calendar event") + " was updated")
                .setContentText(body).setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH).setAutoCancel(true);
        if (pending != null) notification.setContentIntent(pending);
        manager.notify(Math.abs(key.hashCode()), notification.build());
        Log.d(TAG, "Posted update notification for " + eventCoordinate);
    }

    private static void compareValue(JSONObject left, JSONObject right, String key, String label, List<String> changed) {
        if (!left.optString(key).equals(right.optString(key))) changed.add(label);
    }
    private static void compareArray(JSONObject left, JSONObject right, String key, String label, List<String> changed) {
        if (!set(left.optJSONArray(key)).equals(set(right.optJSONArray(key)))) changed.add(label);
    }
    private static Set<String> set(JSONArray array) {
        Set<String> values = new HashSet<>();
        if (array == null) return values;
        for (int i = 0; i < array.length(); i++) values.add(array.optString(i).trim().toLowerCase());
        values.remove(""); return values;
    }
    private static String tag(JSONArray tags, String name) { return firstTag(tags, name, ""); }
    private static String firstTag(JSONArray tags, String first, String second) {
        if (tags == null) return "";
        for (int i = 0; i < tags.length(); i++) {
            JSONArray tag = tags.optJSONArray(i);
            if (tag != null && (first.equals(tag.optString(0)) || second.equals(tag.optString(0)))) return tag.optString(1);
        }
        return "";
    }
    private static JSONArray tagsFor(JSONArray tags, String name) {
        JSONArray values = new JSONArray();
        if (tags == null) return values;
        for (int i = 0; i < tags.length(); i++) { JSONArray tag = tags.optJSONArray(i); if (tag != null && name.equals(tag.optString(0))) values.put(tag.optString(1)); }
        return values;
    }
    private static JSONArray formsFor(JSONArray tags) {
        JSONArray forms = new JSONArray();
        if (tags == null) return forms;
        for (int i = 0; i < tags.length(); i++) {
            JSONArray current = tags.optJSONArray(i);
            if (current == null || !"form".equals(current.optString(0)) || current.optString(1).isEmpty()) continue;
            JSONObject form = new JSONObject();
            try {
                form.put("naddr", current.optString(1));
                if (!current.optString(2).isEmpty()) form.put("viewKey", current.optString(2));
                forms.put(form);
            } catch (Exception ignored) {}
        }
        return forms;
    }
    private static String recurrenceRule(JSONArray tags) {
        if (tags == null) return "";
        for (int i = 0; i + 1 < tags.length(); i++) {
            JSONArray label = tags.optJSONArray(i);
            JSONArray value = tags.optJSONArray(i + 1);
            if (label != null && value != null && "L".equals(label.optString(0))
                    && "rrule".equals(label.optString(1)) && "l".equals(value.optString(0))) {
                return value.optString(1);
            }
        }
        return "";
    }
    private static String repeatRule(JSONObject event) {
        JSONObject repeat = event.optJSONObject("repeat");
        return repeat == null ? "" : repeat.optString("rrule");
    }
    private static Set<String> formSet(JSONArray forms) {
        Set<String> values = new HashSet<>();
        if (forms == null) return values;
        for (int index = 0; index < forms.length(); index++) {
            JSONObject form = forms.optJSONObject(index);
            if (form != null && !form.optString("naddr").isEmpty()) {
                values.add(form.optString("naddr") + "\u0000" + form.optString("viewKey"));
            }
        }
        return values;
    }
    private static boolean isAllDay(long begin, long end) {
        if (end <= begin) return false;
        Calendar start = Calendar.getInstance();
        Calendar finish = Calendar.getInstance();
        start.setTimeInMillis(begin);
        finish.setTimeInMillis(end);
        return start.get(Calendar.HOUR_OF_DAY) == 0 && start.get(Calendar.MINUTE) == 0
                && finish.get(Calendar.HOUR_OF_DAY) == 0 && finish.get(Calendar.MINUTE) == 0;
    }
    private static long secondsToMillis(String value) { try { return Long.parseLong(value) * 1000L; } catch (Exception ignored) { return 0; } }
    private static List<String> readStrings(String raw) {
        List<String> values = new ArrayList<>();
        try { JSONArray array = new JSONArray(raw); for (int i = 0; i < array.length(); i++) values.add(array.getString(i)); } catch (Exception ignored) {}
        return values;
    }
    private static String formatRange(long begin, long end) {
        return DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT, Locale.getDefault()).format(new Date(begin))
                + " - " + DateFormat.getTimeInstance(DateFormat.SHORT, Locale.getDefault()).format(new Date(end));
    }
    private static final class UpdateSummary {
        final List<String> changed; final boolean timeChanged; final boolean scheduleChanged; final String body;
        UpdateSummary(List<String> changed, boolean timeChanged, boolean scheduleChanged, String body) {
            this.changed = changed; this.timeChanged = timeChanged; this.scheduleChanged = scheduleChanged; this.body = body;
        }
    }
    private static final class PendingUpdate {
        final JSONObject event; final String body;
        PendingUpdate(JSONObject event, String body) { this.event = event; this.body = body; }
    }
}
