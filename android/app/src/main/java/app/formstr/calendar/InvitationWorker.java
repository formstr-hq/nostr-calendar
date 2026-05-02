package app.formstr.calendar;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

import okhttp3.OkHttpClient;

/**
 * Background worker that periodically queries Nostr relays for new kind 1052
 * invitation events (gift wraps) addressed to the logged-in user.
 * It only counts events — no decryption is performed.
 */
public class InvitationWorker extends Worker {

    private static final String TAG = "InvitationWorker";
    private static final String PREFS_NAME = "CapacitorStorage";
    private static final String PUBKEY_KEY = "bg:userPubkey";
    private static final String RELAYS_KEY = "bg:relays";
    private static final String LAST_INVITATION_FETCH_KEY = "bg:lastInvitationFetchTime";
    private static final String SEEN_INVITATIONS_KEY = "cal:invitations";
    private static final String CHANNEL_ID = "calendar_invitations";
    private static final int NOTIFICATION_ID = 0x1052;
    private static final int MAX_RELAYS = 3;
    private static final long RELAY_TIMEOUT_SECONDS = 15;
    private static final long OFFSET = 0;

    public InvitationWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Log.d(TAG, "InvitationWorker starting");

        try {
            SharedPreferences prefs = getApplicationContext()
                    .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

            String pubkey = RelayQueryUtils.parseJsonString(prefs.getString(PUBKEY_KEY, null));
            String relaysRaw = prefs.getString(RELAYS_KEY, null);
            String lastFetchRaw = prefs.getString(LAST_INVITATION_FETCH_KEY, null);

            if (pubkey == null || pubkey.isEmpty()) {
                Log.d(TAG, "No pubkey found, skipping");
                return Result.success();
            }
            Log.d(TAG, "Pubkey found " + pubkey);

            if (relaysRaw == null || relaysRaw.isEmpty()) {
                Log.d(TAG, "No relays found, skipping");
                return Result.success();
            }

            long since = System.currentTimeMillis() / 1000 - 7 * 24 * 60 * 60;
            if (lastFetchRaw != null) {
                try {
                    long lastFetchTime = Long.parseLong(lastFetchRaw.replace("\"", ""));
                    since = lastFetchTime - OFFSET;
                } catch (NumberFormatException e) {
                    Log.w(TAG, "Failed to parse lastInvitationFetchTime", e);
                }
            }

            JSONArray relaysArray = new JSONArray(relaysRaw);
            int relayCount = Math.min(relaysArray.length(), MAX_RELAYS);

            // Load invitation IDs that the user has already seen (stored locally)
            Set<String> seenInvitationIds = loadSeenInvitationIds(prefs);
            Log.d(TAG, "Loaded " + seenInvitationIds.size() + " seen invitation id(s)");

            // Fetch kind 84 (ParticipantRemoval) event IDs that the user has dismissed
            Set<String> dismissedInvitationIds = new HashSet<>();
            OkHttpClient client = RelayQueryUtils.createClient(RELAY_TIMEOUT_SECONDS);

            for (int i = 0; i < relayCount; i++) {
                String relay = relaysArray.getString(i).replace("\"", "");
                queryDismissals(client, relay, pubkey, dismissedInvitationIds);
            }
            Log.d(TAG, "Loaded " + dismissedInvitationIds.size() + " dismissed invitation id(s)");

            Set<String> eventIds = new HashSet<>();
            for (int i = 0; i < relayCount; i++) {
                String relay = relaysArray.getString(i).replace("\"", "");
                queryRelay(client, relay, pubkey, since, eventIds, seenInvitationIds, dismissedInvitationIds);
            }

            RelayQueryUtils.shutdownClient(client);

            Log.d(TAG, "Found " + eventIds.size() + " new invitation(s)");

            if (!eventIds.isEmpty()) {
                showNotification(eventIds.size());
            }

            prefs.edit()
                    .putString(LAST_INVITATION_FETCH_KEY, String.valueOf(System.currentTimeMillis() / 1000))
                    .apply();

            return Result.success();
        } catch (Exception e) {
            Log.e(TAG, "InvitationWorker failed", e);
            return Result.retry();
        }
    }

    /**
     * Loads the set of originalInvitationId values from the locally cached
     * invitations (cal:invitations). These are gift-wrap event IDs that the
     * app has already shown to the user — no need to re-notify.
     */
    private Set<String> loadSeenInvitationIds(SharedPreferences prefs) {
        Set<String> ids = new HashSet<>();
        String raw = prefs.getString(SEEN_INVITATIONS_KEY, null);
        if (raw == null) return ids;
        try {
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject inv = arr.getJSONObject(i);
                if (inv.has("originalInvitationId")) {
                    ids.add(inv.getString("originalInvitationId"));
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to parse seen invitations", e);
        }
        return ids;
    }

    /**
     * Queries kind 84 (ParticipantRemoval) events authored by the user.
     * Each such event has ["e", giftWrapId] tags that identify invitations
     * the user has explicitly dismissed. Adds those IDs to dismissedIds.
     */
    private void queryDismissals(OkHttpClient client, String relayUrl, String pubkey,
                                 Set<String> dismissedIds) {
        try {
            JSONObject filterObj = new JSONObject();
            filterObj.put("kinds", new JSONArray().put(84));
            filterObj.put("authors", new JSONArray().put(pubkey));

            RelayQueryUtils.queryEvents(
                    client,
                    relayUrl,
                    "k84",
                    filterObj,
                    RELAY_TIMEOUT_SECONDS,
                    TAG,
                    event -> {
                        JSONArray tags = event.getJSONArray("tags");
                        for (int i = 0; i < tags.length(); i++) {
                            JSONArray tag = tags.getJSONArray(i);
                            if (tag.length() >= 2 && "e".equals(tag.getString(0))) {
                                synchronized (dismissedIds) {
                                    dismissedIds.add(tag.getString(1));
                                }
                            }
                        }
                    }
            );
        } catch (Exception e) {
            Log.w(TAG, "Failed to query kind 84 from relay: " + relayUrl, e);
        }
    }

    private void queryRelay(OkHttpClient client, String relayUrl, String pubkey,
                            long since, Set<String> eventIds,
                            Set<String> seenInvitationIds, Set<String> dismissedInvitationIds) {
        Log.d(TAG, "Querying: " + relayUrl + " " + " " + pubkey + " " + since);

        try {
            JSONObject filterObj = new JSONObject();
            filterObj.put("kinds", new JSONArray().put(1052));
            filterObj.put("#p", new JSONArray().put(pubkey));
            if (since > 0) {
                filterObj.put("since", since);
            }

            RelayQueryUtils.queryEvents(
                    client,
                    relayUrl,
                    "inv",
                    filterObj,
                    RELAY_TIMEOUT_SECONDS,
                    TAG,
                    event -> {
                        JSONArray tags = event.optJSONArray("tags");
                        if (tags != null) {
                            for (int i = 0; i < tags.length(); i++) {
                                JSONArray tag = tags.optJSONArray(i);
                                if (tag == null || tag.length() < 2) continue;
                                if ("booking".equals(tag.optString(0))
                                        && "true".equals(tag.optString(1))) {
                                    Log.d(TAG, "Skipping booking-origin invitation " + event.getString("id"));
                                    return;
                                }
                            }
                        }
                        String id = event.getString("id");
                        if (seenInvitationIds.contains(id) || dismissedInvitationIds.contains(id)) {
                            Log.d(TAG, "Skipping already-handled invitation " + id);
                            return;
                        }
                        Log.d(TAG, "New invitation received " + id);
                        synchronized (eventIds) {
                            eventIds.add(id);
                        }
                    }
            );
        } catch (Exception e) {
            Log.w(TAG, "Failed to query relay: " + relayUrl, e);
        }
    }

    private void showNotification(int count) {
        Context context = getApplicationContext();
        ensureChannel(context);

        int smallIconId = context.getResources().getIdentifier(
                "ic_notification", "drawable", context.getPackageName());
        if (smallIconId == 0) {
            smallIconId = context.getApplicationInfo().icon;
        }

        Intent launchIntent = context.getPackageManager()
                .getLaunchIntentForPackage(context.getPackageName());
        if (launchIntent != null) {
            launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            launchIntent.putExtra("openRoute", "/notifications");
        }

        PendingIntent pendingIntent = null;
        if (launchIntent != null) {
            pendingIntent = PendingIntent.getActivity(
                    context, NOTIFICATION_ID, launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        }

        String title = "New Calendar Invitation" + (count > 1 ? "s" : "");
        String body = "You have " + count + " new invitation" + (count > 1 ? "s" : "");

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(smallIconId)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true);

        if (pendingIntent != null) {
            builder.setContentIntent(pendingIntent);
        }

        NotificationManager manager = (NotificationManager)
                context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, builder.build());
            Log.d(TAG, "Invitation notification fired: " + count + " invitation(s)");
        }
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = (NotificationManager)
                    context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null && manager.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID,
                        "Calendar Invitations",
                        NotificationManager.IMPORTANCE_DEFAULT);
                channel.setDescription("Notifications for new calendar event invitations");
                manager.createNotificationChannel(channel);
            }
        }
    }
}
