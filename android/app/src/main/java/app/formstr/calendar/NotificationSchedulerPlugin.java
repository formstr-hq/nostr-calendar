package app.formstr.calendar;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Small foreground bridge: all scheduling decisions stay in NotificationWorker. */
@CapacitorPlugin(name = "NotificationScheduler")
public class NotificationSchedulerPlugin extends Plugin {

    @PluginMethod
    public void reconcile(PluginCall call) {
        NotificationWorker.enqueueImmediate(getContext());
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        NotificationWorker.clearScheduledNotifications(getContext());
        call.resolve();
    }

    @PluginMethod
    public void cancelEvent(PluginCall call) {
        String eventId = call.getString("eventId");
        if (eventId == null || eventId.isEmpty()) {
            call.reject("eventId is required");
            return;
        }

        NotificationWorker.cancelEventNotifications(getContext(), eventId);
        call.resolve();
    }
}
