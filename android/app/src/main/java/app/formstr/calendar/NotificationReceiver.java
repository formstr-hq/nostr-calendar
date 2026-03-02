package app.formstr.calendar;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

/**
 * BroadcastReceiver that fires calendar event notifications at the scheduled time.
 * Triggered by AlarmManager alarms set from NotificationWorker.
 */
public class NotificationReceiver extends BroadcastReceiver {

    private static final String TAG = "NotificationReceiver";
    static final String CHANNEL_ID = "calendar_events";
    static final String EXTRA_NOTIFICATION_ID = "notification_id";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_BODY = "body";
    static final String EXTRA_EVENT_ID = "event_id";

    @Override
    public void onReceive(Context context, Intent intent) {
        int notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0);
        String title = intent.getStringExtra(EXTRA_TITLE);
        String body = intent.getStringExtra(EXTRA_BODY);

        if (title == null || body == null) {
            Log.w(TAG, "Missing title or body in notification intent");
            return;
        }

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
        }

        android.app.PendingIntent pendingIntent = null;
        if (launchIntent != null) {
            pendingIntent = android.app.PendingIntent.getActivity(
                    context, notificationId, launchIntent,
                    android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE);
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(smallIconId)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true);

        if (pendingIntent != null) {
            builder.setContentIntent(pendingIntent);
        }

        NotificationManager manager = (NotificationManager)
                context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(notificationId, builder.build());
            Log.d(TAG, "Notification fired: id=" + notificationId + " title=" + title);
        }
    }

    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = (NotificationManager)
                    context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null && manager.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID,
                        "Calendar Events",
                        NotificationManager.IMPORTANCE_HIGH);
                channel.setDescription("Notifications for upcoming calendar events");
                manager.createNotificationChannel(channel);
            }
        }
    }
}
