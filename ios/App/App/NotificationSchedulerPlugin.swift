import Capacitor

@objc(NotificationSchedulerPlugin)
public class NotificationSchedulerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NotificationSchedulerPlugin"
    public let jsName = "NotificationScheduler"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "reconcile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelEvent", returnType: CAPPluginReturnPromise),
    ]

    @objc func reconcile(_ call: CAPPluginCall) {
        IOSNotificationScheduler.shared.reconcile {
            call.resolve()
        }
    }

    @objc func clear(_ call: CAPPluginCall) {
        IOSNotificationScheduler.shared.clear {
            call.resolve()
        }
    }

    @objc func cancelEvent(_ call: CAPPluginCall) {
        guard let eventId = call.getString("eventId"), !eventId.isEmpty else {
            call.reject("eventId is required")
            return
        }

        IOSNotificationScheduler.shared.cancel(eventId: eventId) {
            call.resolve()
        }
    }
}
