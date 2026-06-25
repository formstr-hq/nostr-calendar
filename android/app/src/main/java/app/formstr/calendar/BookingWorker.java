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
 * Background worker that polls relays for booking-related gift wraps:
 * - kind 1057 for new incoming booking requests
 * - kind 1058 for booking responses, filtered to approved ones
 */
public class BookingWorker extends Worker {

    private static final String TAG = "BookingWorker";
    private static final String PREFS_NAME = "CapacitorStorage";
    private static final String PUBKEY_KEY = "bg:userPubkey";
    private static final String RELAYS_KEY = "bg:relays";
    private static final String LAST_LOGIN_KEY = "bg:lastLoginTime";
    private static final String LAST_REQUEST_FETCH_KEY = "bg:lastBookingRequestFetchTime";
    private static final String LAST_RESPONSE_FETCH_KEY = "bg:lastBookingResponseFetchTime";
    private static final String REQUEST_CHANNEL_ID = "booking_requests";
    private static final String RESPONSE_CHANNEL_ID = "booking_acceptances";
    private static final int REQUEST_NOTIFICATION_ID = 0x1057;
    private static final int RESPONSE_NOTIFICATION_ID = 0x1058;
    private static final int MAX_RELAYS = 3;
    private static final long RELAY_TIMEOUT_SECONDS = 15;
    private static final long LOOKBACK_SECONDS = 7L * 24 * 60 * 60;

    public BookingWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Log.d(TAG, "BookingWorker starting");

        try {
            SharedPreferences prefs = getApplicationContext()
                    .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

            String pubkey = RelayQueryUtils.parseJsonString(prefs.getString(PUBKEY_KEY, null));
            String relaysRaw = prefs.getString(RELAYS_KEY, null);

            if (pubkey == null || pubkey.isEmpty()) {
                Log.d(TAG, "No pubkey found, skipping");
                return Result.success();
            }

            if (relaysRaw == null || relaysRaw.isEmpty()) {
                Log.d(TAG, "No relays found, skipping");
                return Result.success();
            }

            long nowSeconds = System.currentTimeMillis() / 1000;
            long fallbackSince = nowSeconds - LOOKBACK_SECONDS;
            long lastLogin = parseLongPref(prefs.getString(LAST_LOGIN_KEY, null), fallbackSince);
            long requestSince = parseLongPref(
                    prefs.getString(LAST_REQUEST_FETCH_KEY, null),
                    lastLogin > 0 ? lastLogin : fallbackSince
            );
            long responseSince = parseLongPref(
                    prefs.getString(LAST_RESPONSE_FETCH_KEY, null),
                    lastLogin > 0 ? lastLogin : fallbackSince
            );

            JSONArray relaysArray = new JSONArray(relaysRaw);
            int relayCount = Math.min(relaysArray.length(), MAX_RELAYS);

            OkHttpClient client = RelayQueryUtils.createClient(RELAY_TIMEOUT_SECONDS);

            Set<String> requestIds = new HashSet<>();
            Set<String> approvalIds = new HashSet<>();

            for (int i = 0; i < relayCount; i++) {
                String relay = relaysArray.getString(i).replace("\"", "");
                queryBookingRequests(client, relay, pubkey, requestSince, requestIds);
                queryApprovedResponses(client, relay, pubkey, responseSince, approvalIds);
            }

            RelayQueryUtils.shutdownClient(client);

            if (!requestIds.isEmpty()) {
                showBookingRequestNotification(requestIds.size());
            }
            if (!approvalIds.isEmpty()) {
                showBookingAcceptedNotification(approvalIds.size());
            }

            prefs.edit()
                    .putString(LAST_REQUEST_FETCH_KEY, String.valueOf(nowSeconds))
                    .putString(LAST_RESPONSE_FETCH_KEY, String.valueOf(nowSeconds))
                    .apply();

            Log.d(TAG, "BookingWorker done. Requests=" + requestIds.size()
                    + ", approvals=" + approvalIds.size());
            return Result.success();
        } catch (Exception e) {
            Log.e(TAG, "BookingWorker failed", e);
            return Result.retry();
        }
    }

    private long parseLongPref(String raw, long defaultValue) {
        if (raw == null) return defaultValue;
        try {
            return Long.parseLong(raw.replace("\"", ""));
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    private void queryBookingRequests(OkHttpClient client, String relayUrl, String pubkey,
                                      long since, Set<String> requestIds) {
        queryRelay(client, relayUrl, pubkey, 1057, since, requestIds, false);
    }

    private void queryApprovedResponses(OkHttpClient client, String relayUrl, String pubkey,
                                        long since, Set<String> approvalIds) {
        queryRelay(client, relayUrl, pubkey, 1058, since, approvalIds, true);
    }

    private void queryRelay(OkHttpClient client, String relayUrl, String pubkey,
                            int kind, long since, Set<String> eventIds,
                            boolean approvalsOnly) {
        try {
            JSONObject filterObj = new JSONObject();
            filterObj.put("kinds", new JSONArray().put(kind));
            filterObj.put("#p", new JSONArray().put(pubkey));
            if (since > 0) {
                filterObj.put("since", since);
            }

            RelayQueryUtils.queryEvents(
                    client,
                    relayUrl,
                    "booking_" + kind,
                    filterObj,
                    RELAY_TIMEOUT_SECONDS,
                    TAG,
                    event -> {
                        if (approvalsOnly && !isApprovedResponse(event)) {
                            return;
                        }
                        synchronized (eventIds) {
                            eventIds.add(event.getString("id"));
                        }
                    }
            );
        } catch (Exception e) {
            Log.w(TAG, "Failed to query booking relay: " + relayUrl, e);
        }
    }

    private boolean isApprovedResponse(JSONObject event) {
        JSONArray tags = event.optJSONArray("tags");
        if (tags == null) return false;
        for (int i = 0; i < tags.length(); i++) {
            JSONArray tag = tags.optJSONArray(i);
            if (tag == null || tag.length() < 2) continue;
            if ("status".equals(tag.optString(0)) && "approved".equals(tag.optString(1))) {
                return true;
            }
        }
        return false;
    }

    private void showBookingRequestNotification(int count) {
        Context context = getApplicationContext();
        ensureChannel(context, REQUEST_CHANNEL_ID, "Booking Requests",
                "Notifications for new booking requests");

        int smallIconId = context.getResources().getIdentifier(
                "ic_notification", "drawable", context.getPackageName());
        if (smallIconId == 0) {
            smallIconId = context.getApplicationInfo().icon;
        }

        PendingIntent pendingIntent = buildBookingsPendingIntent(context, REQUEST_NOTIFICATION_ID);
        String title = "New Booking Request" + (count > 1 ? "s" : "");
        String body = "You have " + count + " new booking request" + (count > 1 ? "s" : "");

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, REQUEST_CHANNEL_ID)
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
            manager.notify(REQUEST_NOTIFICATION_ID, builder.build());
        }
    }

    private void showBookingAcceptedNotification(int count) {
        Context context = getApplicationContext();
        ensureChannel(context, RESPONSE_CHANNEL_ID, "Booking Acceptances",
                "Notifications when your booking is accepted");

        int smallIconId = context.getResources().getIdentifier(
                "ic_notification", "drawable", context.getPackageName());
        if (smallIconId == 0) {
            smallIconId = context.getApplicationInfo().icon;
        }

        PendingIntent pendingIntent = buildBookingsPendingIntent(context, RESPONSE_NOTIFICATION_ID);
        String title = count == 1 ? "Booking Accepted" : "Bookings Accepted";
        String body = count == 1
                ? "One of your booking requests was accepted"
                : count + " of your booking requests were accepted";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, RESPONSE_CHANNEL_ID)
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
            manager.notify(RESPONSE_NOTIFICATION_ID, builder.build());
        }
    }

    private PendingIntent buildBookingsPendingIntent(Context context, int requestCode) {
        Intent launchIntent = context.getPackageManager()
                .getLaunchIntentForPackage(context.getPackageName());
        if (launchIntent == null) {
            return null;
        }
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        launchIntent.putExtra("openRoute", "/bookings");
        return PendingIntent.getActivity(
                context, requestCode, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void ensureChannel(Context context, String channelId, String channelName,
                                      String description) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = (NotificationManager)
                    context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null && manager.getNotificationChannel(channelId) == null) {
                NotificationChannel channel = new NotificationChannel(
                        channelId,
                        channelName,
                        NotificationManager.IMPORTANCE_DEFAULT);
                channel.setDescription(description);
                manager.createNotificationChannel(channel);
            }
        }
    }
}
