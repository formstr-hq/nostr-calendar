package app.formstr.calendar;

import android.util.Log;

import androidx.annotation.NonNull;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

public final class RelayQueryUtils {

    private RelayQueryUtils() {}

    public interface EventProcessor {
        void onEvent(JSONObject event) throws Exception;
    }

    public static OkHttpClient createClient(long timeoutSeconds) {
        return new OkHttpClient.Builder()
                .connectTimeout(timeoutSeconds, TimeUnit.SECONDS)
                .readTimeout(timeoutSeconds, TimeUnit.SECONDS)
                .build();
    }

    public static void shutdownClient(OkHttpClient client) {
        client.dispatcher().executorService().shutdown();
        client.connectionPool().evictAll();
    }

    /**
     * Capacitor Preferences stores values as JSON strings (e.g. "\"abc\"").
     * Strip the outer quotes to get the raw value.
     */
    public static String parseJsonString(String raw) {
        if (raw == null) return null;
        String trimmed = raw.trim();
        if (trimmed.startsWith("\"") && trimmed.endsWith("\"") && trimmed.length() >= 2) {
            return trimmed.substring(1, trimmed.length() - 1);
        }
        return trimmed;
    }

    public static void queryEvents(OkHttpClient client, String relayUrl, String subscriptionPrefix,
                                   JSONObject filterObj, long timeoutSeconds, String logTag,
                                   EventProcessor eventProcessor) {
        String httpUrl = relayUrl.replace("wss://", "https://").replace("ws://", "http://");
        CountDownLatch latch = new CountDownLatch(1);

        try {
            Request request = new Request.Builder().url(httpUrl).build();
            String subscriptionId = subscriptionPrefix + "_" + System.currentTimeMillis();

            JSONArray reqMessage = new JSONArray();
            reqMessage.put("REQ");
            reqMessage.put(subscriptionId);
            reqMessage.put(filterObj);

            client.newWebSocket(request, new WebSocketListener() {
                @Override
                public void onOpen(@NonNull WebSocket webSocket, @NonNull Response response) {
                    webSocket.send(reqMessage.toString());
                }

                @Override
                public void onMessage(@NonNull WebSocket webSocket, @NonNull String text) {
                    try {
                        JSONArray msg = new JSONArray(text);
                        String type = msg.getString(0);

                        if ("EVENT".equals(type) && msg.length() >= 3) {
                            eventProcessor.onEvent(msg.getJSONObject(2));
                        } else if ("EOSE".equals(type)) {
                            JSONArray closeMsg = new JSONArray();
                            closeMsg.put("CLOSE");
                            closeMsg.put(subscriptionId);
                            webSocket.send(closeMsg.toString());
                            webSocket.close(1000, "done");
                            latch.countDown();
                        }
                    } catch (Exception e) {
                        Log.w(logTag, "Failed to parse relay message from " + relayUrl, e);
                    }
                }

                @Override
                public void onFailure(@NonNull WebSocket webSocket, @NonNull Throwable t,
                                      Response response) {
                    Log.w(logTag, "WebSocket failure for " + relayUrl, t);
                    latch.countDown();
                }

                @Override
                public void onClosed(@NonNull WebSocket webSocket, int code,
                                     @NonNull String reason) {
                    latch.countDown();
                }
            });

            latch.await(timeoutSeconds, TimeUnit.SECONDS);
        } catch (Exception e) {
            Log.w(logTag, "Failed to query relay: " + relayUrl, e);
        }
    }
}
