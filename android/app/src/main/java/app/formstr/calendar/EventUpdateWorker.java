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

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.DateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
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
        try {
            Context context = getApplicationContext();
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            JSONArray events = new JSONArray(prefs.getString(EVENTS_KEY, "[]"));
            String currentUser = RelayQueryUtils.parseJsonString(prefs.getString(USER_KEY, ""));
            List<String> defaultRelays = readStrings(prefs.getString(RELAYS_KEY, "[]"));
            Map<String, JSONObject> freshByCoordinate = new HashMap<>();
            OkHttpClient client = RelayQueryUtils.createClient(RELAY_TIMEOUT_SECONDS);

            try {
                for (int index = 0; index < events.length(); index++) {
                    JSONObject cached = events.optJSONObject(index);
                    if (!isEligible(cached)) continue;
                    queryLatest(client, cached, defaultRelays, freshByCoordinate);
                }
            } finally {
                RelayQueryUtils.shutdownClient(client);
            }

            boolean changed = false;
            boolean rescheduleReminders = false;
            for (int index = 0; index < events.length(); index++) {
                JSONObject cached = events.optJSONObject(index);
                if (cached == null) continue;
                JSONObject fresh = freshByCoordinate.get(coordinate(cached));
                if (fresh == null || fresh.optLong("created_at") <= cached.optLong("createdAt")) continue;

                JSONObject updated = cached.optBoolean("isPrivateEvent", false)
                        ? parsePrivateEvent(fresh, cached)
                        : parsePublicEvent(fresh, cached);
                if (updated == null) continue;
                UpdateSummary summary = compare(cached, updated);
                events.put(index, updated);
                changed = true;
                rescheduleReminders |= summary.timeChanged;
                if (shouldNotify(cached, updated, currentUser, summary)) {
                    postUpdate(context, updated, summary.body);
                }
            }

            if (changed) {
                prefs.edit().putString(EVENTS_KEY, events.toString()).apply();
                CalendarWidget.refreshAll(context);
                if (rescheduleReminders) NotificationWorker.enqueueImmediate(context);
            }
            return Result.success();
        } catch (Exception error) {
            android.util.Log.w(TAG, "Event update poll failed", error);
            return Result.retry();
        }
    }

    private void queryLatest(OkHttpClient client, JSONObject cached, List<String> defaults,
                             Map<String, JSONObject> latest) {
        List<String> relays = new ArrayList<>();
        String hint = cached.optString("relayHint", "");
        if (!hint.isEmpty()) relays.add(hint);
        for (String relay : defaults) if (!relays.contains(relay)) relays.add(relay);
        JSONObject filter = new JSONObject();
        try {
            filter.put("kinds", new JSONArray().put(cached.getInt("kind")));
            filter.put("authors", new JSONArray().put(cached.getString("user")));
            filter.put("#d", new JSONArray().put(cached.getString("id")));
        } catch (Exception ignored) {
            return;
        }
        String expected = coordinate(cached);
        for (int index = 0; index < Math.min(MAX_RELAYS, relays.size()); index++) {
            RelayQueryUtils.queryEvents(client, relays.get(index), "event_update", filter,
                    RELAY_TIMEOUT_SECONDS, TAG, event -> {
                        if (!expected.equals(coordinate(event))) return;
                        JSONObject known = latest.get(expected);
                        if (known == null || event.optLong("created_at") > known.optLong("created_at")) {
                            latest.put(expected, event);
                        }
                    });
        }
    }

    private static boolean isEligible(JSONObject event) {
        if (event == null || "device".equals(event.optString("source")) || event.optBoolean("isInvitation")) return false;
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

    private static JSONObject parsePublicEvent(JSONObject event, JSONObject cached) {
        if (event.optInt("kind") != 31923 || event.optString("id").isEmpty()) return null;
        try {
            JSONObject parsed = new JSONObject(cached.toString());
            JSONArray tags = event.getJSONArray("tags");
            parsed.put("eventId", event.getString("id"));
            parsed.put("createdAt", event.getLong("created_at"));
            parsed.put("user", event.getString("pubkey"));
            parsed.put("id", tag(tags, "d"));
            parsed.put("title", firstTag(tags, "title", "name"));
            parsed.put("description", event.optString("content"));
            parsed.put("begin", secondsToMillis(tag(tags, "start")));
            parsed.put("end", secondsToMillis(tag(tags, "end")));
            parsed.put("image", tag(tags, "image"));
            parsed.put("location", tagsFor(tags, "location"));
            parsed.put("participants", tagsFor(tags, "p"));
            parsed.put("categories", tagsFor(tags, "t"));
            return parsed.optLong("begin") > 0 && parsed.optLong("end") > 0 ? parsed : null;
        } catch (Exception ignored) {
            return null;
        }
    }

    private static JSONObject parsePrivateEvent(JSONObject event, JSONObject cached) {
        try {
            JSONArray tags = new JSONArray(Nip44.decrypt(cached.getString("viewKey"), event.getString("content")));
            JSONObject parsed = new JSONObject(cached.toString());
            parsed.put("eventId", event.getString("id"));
            parsed.put("createdAt", event.getLong("created_at"));
            parsed.put("title", tag(tags, "title"));
            parsed.put("description", tag(tags, "description"));
            parsed.put("begin", secondsToMillis(tag(tags, "start")));
            parsed.put("end", secondsToMillis(tag(tags, "end")));
            parsed.put("image", tag(tags, "image"));
            parsed.put("location", tagsFor(tags, "location"));
            parsed.put("participants", tagsFor(tags, "p"));
            String rrule = tag(tags, "l");
            if (!rrule.isEmpty()) parsed.put("repeat", new JSONObject().put("rrule", rrule));
            return parsed.optLong("begin") > 0 && parsed.optLong("end") > 0 ? parsed : null;
        } catch (Exception error) {
            android.util.Log.w(TAG, "Failed to decrypt private event update", error);
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
        compareArray(previous, fresh, "categories", "categories", changed);
        Set<String> oldParticipants = set(previous.optJSONArray("participants"));
        Set<String> newParticipants = set(fresh.optJSONArray("participants"));
        newParticipants.removeAll(oldParticipants);
        if (!newParticipants.isEmpty()) changed.add("participants");
        String body = timeChanged ? "New time: " + formatRange(fresh.optLong("begin"), fresh.optLong("end"))
                : changed.isEmpty() ? "" : "Updated: " + android.text.TextUtils.join(", ", changed);
        return new UpdateSummary(changed, timeChanged, body);
    }

    private static boolean shouldNotify(JSONObject previous, JSONObject fresh, String currentUser, UpdateSummary summary) {
        if (summary.changed.isEmpty() || currentUser == null || currentUser.isEmpty()
                || fresh.optString("user").equalsIgnoreCase(currentUser)) return false;
        Set<String> oldParticipants = set(previous.optJSONArray("participants"));
        Set<String> newParticipants = set(fresh.optJSONArray("participants"));
        return !oldParticipants.contains(currentUser.toLowerCase()) || newParticipants.contains(currentUser.toLowerCase());
    }

    private static void postUpdate(Context context, JSONObject event, String body) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context,
                Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Event updates", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Notifications when calendar events are updated");
            manager.createNotificationChannel(channel);
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
        final List<String> changed; final boolean timeChanged; final String body;
        UpdateSummary(List<String> changed, boolean timeChanged, String body) { this.changed = changed; this.timeChanged = timeChanged; this.body = body; }
    }
}
