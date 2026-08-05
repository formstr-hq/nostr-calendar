import Capacitor

/** Bridges the device's EventKit calendar database to the JS layer. Read and write. */
@objc(DeviceCalendarPlugin)
public class DeviceCalendarPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DeviceCalendarPlugin"
    public let jsName = "DeviceCalendar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listCalendars", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listEvents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateCalendarColor", returnType: CAPPluginReturnPromise),
    ]

    private let store = IOSDeviceCalendarStore.shared

    @objc override public func checkPermissions(_ call: CAPPluginCall) {
        call.resolve(["calendar": store.permissionStatus()])
    }

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        store.requestAccess { status in
            call.resolve(["calendar": status])
        }
    }

    @objc func listCalendars(_ call: CAPPluginCall) {
        call.resolve(["calendars": store.listCalendars()])
    }

    @objc func listEvents(_ call: CAPPluginCall) {
        guard let startMs = call.getDouble("startMs"),
              let endMs = call.getDouble("endMs"),
              endMs > startMs
        else {
            call.reject("startMs and endMs are required, and endMs must be > startMs")
            return
        }
        let calendarIds = call.getArray("calendarIds", String.self) ?? []
        call.resolve(["events": store.listEvents(calendarIds: calendarIds, startMs: startMs, endMs: endMs)])
    }

    @objc func createEvent(_ call: CAPPluginCall) {
        guard let calendarId = call.getString("calendarId"),
              let title = call.getString("title"),
              let beginMs = call.getDouble("beginMs"),
              let endMs = call.getDouble("endMs")
        else {
            call.reject("calendarId, title, beginMs, and endMs are required")
            return
        }
        do {
            let eventId = try store.createEvent(
                calendarId: calendarId,
                title: title,
                description: call.getString("description") ?? "",
                location: call.getString("location") ?? "",
                beginMs: beginMs,
                endMs: endMs,
                allDay: call.getBool("allDay") ?? false,
                rrule: call.getString("rrule")
            )
            call.resolve(["eventId": eventId])
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    @objc func updateEvent(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("A valid event id is required")
            return
        }
        do {
            try store.updateEvent(
                compositeId: id,
                title: call.getString("title"),
                description: call.getString("description"),
                location: call.getString("location"),
                beginMs: call.getDouble("beginMs"),
                endMs: call.getDouble("endMs"),
                allDay: call.getBool("allDay"),
                rrule: call.getString("rrule")
            )
            call.resolve()
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    @objc func deleteEvent(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("A valid event id is required")
            return
        }
        do {
            try store.deleteEvent(compositeId: id)
            call.resolve()
        } catch {
            call.reject(error.localizedDescription)
        }
    }

    @objc func updateCalendarColor(_ call: CAPPluginCall) {
        guard let calendarId = call.getString("calendarId"),
              let color = call.getString("color")
        else {
            call.reject("calendarId and color are required")
            return
        }
        call.resolve(["applied": store.updateCalendarColor(calendarId: calendarId, hex: color)])
    }
}
