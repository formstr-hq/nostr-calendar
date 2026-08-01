import Foundation

struct WidgetEvent: Identifiable {
    let id: String
    let title: String
    let begin: Date
    let allDay: Bool
}

enum WidgetDataStore {
    private static let appGroup = "group.app.formstr.calendar"
    private static let eventsKey = "CapacitorStorage.cal:events"
    private static let calendarsKey = "CapacitorStorage.cal:calendar_lists"
    private static let deviceEventsKey = "CapacitorStorage.cal:device_events"
    private static let deviceCalendarsKey = "CapacitorStorage.cal:device_calendars"
    private static let lookahead: TimeInterval = 5 * 24 * 60 * 60

    static func calendarChoices() -> [CalendarChoice] {
        var choices: [CalendarChoice] = jsonArray(for: calendarsKey).compactMap { calendar in
            guard let id = calendar["id"] as? String, !id.isEmpty else { return nil }
            return CalendarChoice(
                id: "nostr:\(id)",
                name: nonempty(calendar["title"] as? String) ?? "Untitled",
                source: "Nostr"
            )
        }
        choices += jsonArray(for: deviceCalendarsKey).compactMap { calendar in
            guard let id = calendar["id"] as? String, !id.isEmpty else { return nil }
            let name = nonempty(calendar["name"] as? String) ?? "Untitled"
            let account = nonempty(calendar["accountName"] as? String)
            return CalendarChoice(
                id: "device:\(id)",
                name: account.map { "\(name) - \($0)" } ?? name,
                source: "Device"
            )
        }
        return choices.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    static func upcomingEvents(selected choiceIds: [String], now: Date = Date()) -> [WidgetEvent] {
        let selected = Set(choiceIds)
        let useDefault = selected.isEmpty
        let selectedNostr = Set(selected.compactMap { value in
            value.hasPrefix("nostr:") ? String(value.dropFirst("nostr:".count)) : nil
        })
        let selectedDevice = Set(selected.compactMap { value in
            value.hasPrefix("device:") ? String(value.dropFirst("device:".count)) : nil
        })
        let rangeEnd = now.addingTimeInterval(lookahead)
        var result: [WidgetEvent] = []

        if useDefault || !selectedNostr.isEmpty {
            for event in jsonArray(for: eventsKey) {
                guard let calendarId = event["calendarId"] as? String,
                      useDefault || selectedNostr.contains(calendarId),
                      let widgetEvent = makeEvent(event, now: now, rangeEnd: rangeEnd, expandRecurrence: true)
                else { continue }
                result.append(widgetEvent)
            }
        }

        if !selectedDevice.isEmpty {
            for event in jsonArray(for: deviceEventsKey) {
                guard let calendarId = event["calendarId"] as? String,
                      selectedDevice.contains(calendarId),
                      let widgetEvent = makeEvent(event, now: now, rangeEnd: rangeEnd, expandRecurrence: false)
                else { continue }
                result.append(widgetEvent)
            }
        }

        return Array(result.sorted { $0.begin < $1.begin }.prefix(3))
    }

    private static func makeEvent(
        _ event: [String: Any],
        now: Date,
        rangeEnd: Date,
        expandRecurrence: Bool
    ) -> WidgetEvent? {
        guard let beginMs = number(event["begin"]) else { return nil }
        let endMs = number(event["end"]) ?? beginMs
        let begin = Date(timeIntervalSince1970: beginMs / 1_000)
        let end = Date(timeIntervalSince1970: endMs / 1_000)
        let rrule = (event["repeat"] as? [String: Any])?["rrule"] as? String
        let displayBegin: Date

        if expandRecurrence, let rrule, !rrule.isEmpty {
            let searchStart = max(begin, now.addingTimeInterval(-max(0, end.timeIntervalSince(begin))))
            guard let occurrence = WidgetRecurrence.nextOccurrence(
                begin: begin,
                rule: rrule,
                rangeStart: searchStart,
                rangeEnd: rangeEnd
            ) else { return nil }
            displayBegin = occurrence
        } else {
            guard end >= now, begin <= rangeEnd else { return nil }
            displayBegin = begin
        }

        let identifier = event["id"] as? String ?? "\(beginMs)"
        return WidgetEvent(
            id: "\(identifier):\(displayBegin.timeIntervalSince1970)",
            title: nonempty(event["title"] as? String) ?? "Untitled",
            begin: displayBegin,
            allDay: event["allDay"] as? Bool ?? false
        )
    }

    private static func jsonArray(for key: String) -> [[String: Any]] {
        guard let raw = UserDefaults(suiteName: appGroup)?.string(forKey: key),
              let data = raw.data(using: .utf8),
              let value = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else { return [] }
        return value
    }

    private static func number(_ value: Any?) -> Double? {
        (value as? NSNumber)?.doubleValue
    }

    private static func nonempty(_ value: String?) -> String? {
        guard let value, !value.isEmpty else { return nil }
        return value
    }
}
