import EventKit
import Foundation

enum DeviceCalendarError: Error, LocalizedError {
    case invalidInput(String)
    case notFound(String)
    case saveFailed(String)

    var errorDescription: String? {
        switch self {
        case .invalidInput(let message): return message
        case .notFound(let message): return message
        case .saveFailed(let message): return message
        }
    }
}

/// Owns the `EKEventStore` and bridges it to the JS-facing shapes the
/// `DeviceCalendarPlugin` resolves/rejects with — mirrors the existing
/// scheduler split (`NotificationSchedulerPlugin` / `IOSNotificationScheduler`).
final class IOSDeviceCalendarStore {
    static let shared = IOSDeviceCalendarStore()

    private let eventStore = EKEventStore()

    private init() {}

    // MARK: - Permissions

    func permissionStatus() -> String {
        Self.mapStatus(EKEventStore.authorizationStatus(for: .event))
    }

    /// Always requests full access, never write-only, since read+write are both needed.
    func requestAccess(completion: @escaping (String) -> Void) {
        if #available(iOS 17, *) {
            eventStore.requestFullAccessToEvents { granted, _ in
                DispatchQueue.main.async {
                    completion(granted ? "granted" : Self.mapStatus(EKEventStore.authorizationStatus(for: .event)))
                }
            }
        } else {
            eventStore.requestAccess(to: .event) { granted, _ in
                DispatchQueue.main.async {
                    completion(granted ? "granted" : Self.mapStatus(EKEventStore.authorizationStatus(for: .event)))
                }
            }
        }
    }

    private static func mapStatus(_ status: EKAuthorizationStatus) -> String {
        if #available(iOS 17, *) {
            switch status {
            case .fullAccess: return "granted"
            case .writeOnly: return "prompt-with-rationale"
            case .denied, .restricted: return "denied"
            case .notDetermined: return "prompt"
            @unknown default: return "prompt"
            }
        }
        switch status {
        case .authorized: return "granted"
        case .denied, .restricted: return "denied"
        case .notDetermined: return "prompt"
        @unknown default: return "prompt"
        }
    }

    // MARK: - Calendars

    func listCalendars() -> [[String: Any]] {
        let defaultCalendar = eventStore.defaultCalendarForNewEvents
        return eventStore.calendars(for: .event).map { calendar in
            [
                "id": calendar.calendarIdentifier,
                "name": calendar.title,
                "accountName": calendar.source.title,
                "color": Self.hex(from: calendar.cgColor),
                "isPrimary": calendar.calendarIdentifier == defaultCalendar?.calendarIdentifier,
                "canWrite": calendar.allowsContentModifications,
            ]
        }
    }

    func updateCalendarColor(calendarId: String, hex: String) -> Bool {
        guard let calendar = eventStore.calendar(withIdentifier: calendarId),
              calendar.allowsContentModifications,
              calendar.type != .birthday,
              let cgColor = Self.cgColor(fromHex: hex)
        else {
            return false
        }
        // Attempt-and-catch is the only reliable signal here (unlike Android's
        // access-level pre-check) — some sync adapters silently revert this on
        // next sync regardless of what this call reports.
        calendar.cgColor = cgColor
        do {
            try eventStore.saveCalendar(calendar, commit: true)
            return true
        } catch {
            return false
        }
    }

    // MARK: - Events

    func listEvents(calendarIds: [String], startMs: Double, endMs: Double) -> [[String: Any]] {
        let calendars: [EKCalendar]? = calendarIds.isEmpty
            ? nil
            : calendarIds.compactMap { eventStore.calendar(withIdentifier: $0) }
        let start = Date(timeIntervalSince1970: startMs / 1000)
        let end = Date(timeIntervalSince1970: endMs / 1000)
        let predicate = eventStore.predicateForEvents(withStart: start, end: end, calendars: calendars)

        return eventStore.events(matching: predicate).map { event in
            var obj: [String: Any] = [
                // EventKit has no per-occurrence id the way Android's Instances table
                // does (eventIdentifier is shared across a whole series) — synthesize
                // the same composite shape the TS layer expects.
                "id": "\(Int64((event.startDate?.timeIntervalSince1970 ?? 0) * 1000)):\(event.eventIdentifier ?? "")",
                "calendarId": event.calendar.calendarIdentifier,
                "title": event.title ?? "",
                "description": event.notes ?? "",
                "location": event.location ?? "",
                "beginMs": Int64((event.startDate?.timeIntervalSince1970 ?? 0) * 1000),
                "endMs": Int64((event.endDate?.timeIntervalSince1970 ?? 0) * 1000),
                "allDay": event.isAllDay,
                "organizer": event.organizer?.name ?? "",
            ]
            if let rrule = IOSRecurrenceRuleCodec.toRRuleString(event.recurrenceRules?.first) {
                obj["rrule"] = rrule
            }
            return obj
        }
    }

    func createEvent(
        calendarId: String,
        title: String,
        description: String,
        location: String,
        beginMs: Double,
        endMs: Double,
        allDay: Bool,
        rrule: String?
    ) throws -> String {
        guard let calendar = eventStore.calendar(withIdentifier: calendarId) else {
            throw DeviceCalendarError.invalidInput("calendarId is required")
        }
        let event = EKEvent(eventStore: eventStore)
        event.calendar = calendar
        event.title = title
        event.notes = description
        event.location = location
        event.isAllDay = allDay
        event.startDate = Date(timeIntervalSince1970: beginMs / 1000)
        event.endDate = Date(timeIntervalSince1970: endMs / 1000)
        if let rrule, !rrule.isEmpty, let rule = IOSRecurrenceRuleCodec.toRecurrenceRule(rrule) {
            event.recurrenceRules = [rule]
        }
        do {
            try eventStore.save(event, span: .futureEvents)
        } catch {
            throw DeviceCalendarError.saveFailed("Failed to create event: \(error.localizedDescription)")
        }
        return event.eventIdentifier ?? ""
    }

    func updateEvent(
        compositeId: String,
        title: String?,
        description: String?,
        location: String?,
        beginMs: Double?,
        endMs: Double?,
        allDay: Bool?,
        rrule: String?
    ) throws {
        guard let identifier = Self.parseEventId(compositeId),
              let event = eventStore.event(withIdentifier: identifier)
        else {
            throw DeviceCalendarError.notFound("Failed to update event: no matching event")
        }
        if let title { event.title = title }
        if let description { event.notes = description }
        if let location { event.location = location }
        if let allDay { event.isAllDay = allDay }
        if let beginMs { event.startDate = Date(timeIntervalSince1970: beginMs / 1000) }
        if let endMs { event.endDate = Date(timeIntervalSince1970: endMs / 1000) }
        if let rrule {
            if rrule.isEmpty {
                event.recurrenceRules = nil
            } else if let rule = IOSRecurrenceRuleCodec.toRecurrenceRule(rrule) {
                event.recurrenceRules = [rule]
            }
        }
        do {
            // Whole-series only: always .futureEvents, never .thisEvent.
            try eventStore.save(event, span: .futureEvents)
        } catch {
            throw DeviceCalendarError.saveFailed("Failed to update event: \(error.localizedDescription)")
        }
    }

    func deleteEvent(compositeId: String) throws {
        guard let identifier = Self.parseEventId(compositeId),
              let event = eventStore.event(withIdentifier: identifier)
        else {
            throw DeviceCalendarError.notFound("Failed to delete event: no matching event")
        }
        do {
            try eventStore.remove(event, span: .futureEvents, commit: true)
        } catch {
            throw DeviceCalendarError.saveFailed("Failed to delete event: \(error.localizedDescription)")
        }
    }

    /// `listEvents` returns composite ids of the form "startMs:eventIdentifier". Every
    /// write/delete must operate on the real eventIdentifier, split on the *first*
    /// colon (the millis prefix is a guaranteed pure digit run; eventIdentifier is not
    /// guaranteed colon-free).
    private static func parseEventId(_ compositeId: String) -> String? {
        guard let colonIndex = compositeId.firstIndex(of: ":") else {
            return compositeId.isEmpty ? nil : compositeId
        }
        let identifier = String(compositeId[compositeId.index(after: colonIndex)...])
        return identifier.isEmpty ? nil : identifier
    }

    private static func hex(from cgColor: CGColor?) -> String {
        guard let components = cgColor?.components, components.count >= 3 else { return "#4285f4" }
        let r = Int((components[0] * 255).rounded())
        let g = Int((components[1] * 255).rounded())
        let b = Int((components[2] * 255).rounded())
        return String(format: "#%02X%02X%02X", r, g, b)
    }

    private static func cgColor(fromHex hex: String) -> CGColor? {
        var normalized = hex
        if normalized.hasPrefix("#") { normalized.removeFirst() }
        guard normalized.count == 6, let value = UInt32(normalized, radix: 16) else { return nil }
        let r = CGFloat((value >> 16) & 0xFF) / 255
        let g = CGFloat((value >> 8) & 0xFF) / 255
        let b = CGFloat(value & 0xFF) / 255
        return CGColor(red: r, green: g, blue: b, alpha: 1)
    }
}
