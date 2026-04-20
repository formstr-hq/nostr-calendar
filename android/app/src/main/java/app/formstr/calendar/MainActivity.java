package app.formstr.calendar;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import com.getcapacitor.BridgeActivity;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.concurrent.TimeUnit;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "MainActivity";
    private static final String NOTIFICATION_WORK_NAME = "calendar_notification_worker";
    private static final String INVITATION_WORK_NAME = "invitation_check_worker";
    private String pendingIcsContent = null;
    private String pendingRoute = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        View contentView = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(contentView, (view, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            view.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom);
            return insets;
        });

        scheduleNotificationWorker();
        scheduleInvitationWorker();
        handleIcsIntent(getIntent());
        handleRouteIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIcsIntent(intent);
        handleRouteIntent(intent);
    }

    private void handleIcsIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_VIEW.equals(action)) return;

        Uri uri = intent.getData();
        if (uri == null) return;

        try {
            InputStream inputStream = getContentResolver().openInputStream(uri);
            if (inputStream == null) return;

            BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\n");
            }
            reader.close();
            inputStream.close();

            String icsContent = sb.toString();
            sendIcsToWebView(icsContent);
        } catch (Exception e) {
            Log.e(TAG, "Failed to read ICS file from intent", e);
        }
    }

    private void sendIcsToWebView(String icsContent) {
        if (getBridge() != null && getBridge().getWebView() != null) {
            String escaped = icsContent
                    .replace("\\", "\\\\")
                    .replace("\"", "\\\"")
                    .replace("\n", "\\n")
                    .replace("\r", "\\r");
            String js = "window.dispatchEvent(new CustomEvent('icsFileReceived', { detail: \"" + escaped + "\" }));";
            getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(js, null));
        } else {
            pendingIcsContent = icsContent;
        }
    }

    private void handleRouteIntent(Intent intent) {
        if (intent == null) return;
        String route = intent.getStringExtra("openRoute");
        if (route == null) return;

        if (getBridge() != null && getBridge().getWebView() != null) {
            String escaped = route.replace("\\", "\\\\").replace("'", "\\'");
            String js = "window.dispatchEvent(new CustomEvent('openRoute', { detail: '" + escaped + "' }));";
            getBridge().getWebView().post(() ->
                    getBridge().getWebView().evaluateJavascript(js, null));
        } else {
            pendingRoute = route;
        }
        // Clear the extra so it doesn't fire again on configuration change
        intent.removeExtra("openRoute");
    }

    @Override
    public void onStart() {
        super.onStart();
        if (pendingIcsContent != null && getBridge() != null && getBridge().getWebView() != null) {
            sendIcsToWebView(pendingIcsContent);
            pendingIcsContent = null;
        }
        if (pendingRoute != null && getBridge() != null && getBridge().getWebView() != null) {
            handleRouteIntent(new Intent().putExtra("openRoute", pendingRoute));
            pendingRoute = null;
        }
    }

    private void scheduleNotificationWorker() {
        PeriodicWorkRequest workRequest = new PeriodicWorkRequest.Builder(
                NotificationWorker.class, 6, TimeUnit.HOURS)
                .build();

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
                NOTIFICATION_WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                workRequest);
    }

    private void scheduleInvitationWorker() {
        androidx.work.Constraints constraints = new androidx.work.Constraints.Builder()
                .setRequiredNetworkType(androidx.work.NetworkType.CONNECTED)
                .build();

        PeriodicWorkRequest workRequest = new PeriodicWorkRequest.Builder(
                InvitationWorker.class, 15, TimeUnit.MINUTES)
                .setConstraints(constraints)
                .build();

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
                INVITATION_WORK_NAME,
                ExistingPeriodicWorkPolicy.CANCEL_AND_REENQUEUE,
                workRequest);
    }
}
