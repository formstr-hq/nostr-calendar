import EventKit

/// Pure, EKEventStore-independent conversion between RFC5545 RRULE strings
/// and `EKRecurrenceRule`. EventKit has no per-occurrence id concept the way
/// Android's Instances table does, and its recurrence model is a native
/// object rather than a string — this is the trickiest piece of the iOS
/// device-calendar plugin, isolated here so it's self-contained and easy to
/// reason about independently of `EKEventStore`. Supports the FREQ/INTERVAL/
/// BYDAY/COUNT/UNTIL subset the app's recurrence editor produces.
enum IOSRecurrenceRuleCodec {

    private static let weekdayCodes: [(EKWeekday, String)] = [
        (.sunday, "SU"), (.monday, "MO"), (.tuesday, "TU"), (.wednesday, "WE"),
        (.thursday, "TH"), (.friday, "FR"), (.saturday, "SA"),
    ]

    private static let untilFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return formatter
    }()

    static func toRecurrenceRule(_ rrule: String) -> EKRecurrenceRule? {
        var parts: [String: String] = [:]
        for pair in rrule.split(separator: ";") {
            let keyValue = pair.split(separator: "=", maxSplits: 1)
            guard keyValue.count == 2 else { continue }
            parts[String(keyValue[0]).uppercased()] = String(keyValue[1])
        }

        let frequency: EKRecurrenceFrequency
        switch parts["FREQ"] {
        case "DAILY": frequency = .daily
        case "WEEKLY": frequency = .weekly
        case "MONTHLY": frequency = .monthly
        case "YEARLY": frequency = .yearly
        default: return nil
        }

        let interval = parts["INTERVAL"].flatMap { Int($0) } ?? 1

        var daysOfWeek: [EKRecurrenceDayOfWeek]?
        if let byDay = parts["BYDAY"] {
            let days = byDay.split(separator: ",").compactMap { code -> EKRecurrenceDayOfWeek? in
                guard let match = weekdayCodes.first(where: { $0.1 == String(code) }) else { return nil }
                return EKRecurrenceDayOfWeek(match.0)
            }
            daysOfWeek = days.isEmpty ? nil : days
        }

        var end: EKRecurrenceEnd?
        if let count = parts["COUNT"].flatMap({ Int($0) }) {
            end = EKRecurrenceEnd(occurrenceCount: count)
        } else if let until = parts["UNTIL"], let date = untilFormatter.date(from: until) {
            end = EKRecurrenceEnd(end: date)
        }

        return EKRecurrenceRule(
            recurrenceWith: frequency,
            interval: interval,
            daysOfTheWeek: daysOfWeek,
            daysOfTheMonth: nil,
            monthsOfTheYear: nil,
            weeksOfTheYear: nil,
            daysOfTheYear: nil,
            setPositions: nil,
            end: end
        )
    }

    static func toRRuleString(_ rule: EKRecurrenceRule?) -> String? {
        guard let rule else { return nil }

        let freqString: String
        switch rule.frequency {
        case .daily: freqString = "DAILY"
        case .weekly: freqString = "WEEKLY"
        case .monthly: freqString = "MONTHLY"
        case .yearly: freqString = "YEARLY"
        @unknown default: return nil
        }

        var components = ["FREQ=\(freqString)"]
        if rule.interval > 1 {
            components.append("INTERVAL=\(rule.interval)")
        }
        if let days = rule.daysOfTheWeek, !days.isEmpty {
            let codes = days.compactMap { day in
                weekdayCodes.first(where: { $0.0 == day.dayOfTheWeek })?.1
            }
            if !codes.isEmpty {
                components.append("BYDAY=\(codes.joined(separator: ","))")
            }
        }
        if let end = rule.recurrenceEnd {
            if end.occurrenceCount > 0 {
                components.append("COUNT=\(end.occurrenceCount)")
            } else if let endDate = end.endDate {
                components.append("UNTIL=\(untilFormatter.string(from: endDate))")
            }
        }
        return components.joined(separator: ";")
    }
}
