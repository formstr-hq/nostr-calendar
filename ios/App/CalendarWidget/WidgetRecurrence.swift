import Foundation

enum WidgetRecurrence {
    private struct Rule {
        let frequency: String
        let interval: Int
        let weekdays: Set<Int>
        let count: Int?
        let until: Date?
    }

    static func nextOccurrence(
        begin: Date,
        rule rawRule: String,
        rangeStart: Date,
        rangeEnd: Date
    ) -> Date? {
        guard let rule = parse(rawRule) else { return nil }
        if rule.frequency == "WEEKLY", !rule.weekdays.isEmpty {
            return nextWeekday(begin: begin, rule: rule, rangeStart: rangeStart, rangeEnd: rangeEnd)
        }

        var occurrenceNumber = 0
        for period in 0..<1_000_000 {
            guard let candidate = occurrence(begin: begin, rule: rule, period: period) else { continue }
            if candidate > rangeEnd { return nil }
            occurrenceNumber += 1
            if let count = rule.count, occurrenceNumber > count { return nil }
            if let until = rule.until, candidate > until { return nil }
            if candidate >= rangeStart { return candidate }
        }
        return nil
    }

    private static func nextWeekday(
        begin: Date,
        rule: Rule,
        rangeStart: Date,
        rangeEnd: Date
    ) -> Date? {
        let calendar = Calendar.current
        var candidate = begin
        var occurrenceNumber = 0
        for _ in 0..<100_000 where candidate <= rangeEnd {
            if let until = rule.until, candidate > until { return nil }
            if rule.weekdays.contains(calendar.component(.weekday, from: candidate)),
               activeWeek(begin: begin, candidate: candidate, interval: rule.interval) {
                occurrenceNumber += 1
                if let count = rule.count, occurrenceNumber > count { return nil }
                if candidate >= rangeStart { return candidate }
            }
            guard let next = calendar.date(byAdding: .day, value: 1, to: candidate) else { return nil }
            candidate = next
        }
        return nil
    }

    private static func activeWeek(begin: Date, candidate: Date, interval: Int) -> Bool {
        guard interval > 1 else { return true }
        let calendar = Calendar(identifier: .iso8601)
        let beginWeek = calendar.dateInterval(of: .weekOfYear, for: begin)?.start ?? begin
        let candidateWeek = calendar.dateInterval(of: .weekOfYear, for: candidate)?.start ?? candidate
        let weeks = calendar.dateComponents([.weekOfYear], from: beginWeek, to: candidateWeek).weekOfYear ?? 0
        return weeks >= 0 && weeks % interval == 0
    }

    private static func occurrence(begin: Date, rule: Rule, period: Int) -> Date? {
        let amount = rule.interval * period
        switch rule.frequency {
        case "DAILY": return Calendar.current.date(byAdding: .day, value: amount, to: begin)
        case "WEEKLY": return Calendar.current.date(byAdding: .weekOfYear, value: amount, to: begin)
        case "MONTHLY": return strictDate(begin: begin, component: .month, amount: amount)
        case "YEARLY": return strictDate(begin: begin, component: .year, amount: amount)
        default: return nil
        }
    }

    private static func strictDate(begin: Date, component: Calendar.Component, amount: Int) -> Date? {
        let calendar = Calendar.current
        let original = calendar.dateComponents(
            [.year, .month, .day, .hour, .minute, .second, .nanosecond],
            from: begin
        )
        guard let candidate = calendar.date(byAdding: component, value: amount, to: begin),
              calendar.component(.day, from: candidate) == original.day,
              component != .year || calendar.component(.month, from: candidate) == original.month
        else { return nil }
        return candidate
    }

    private static func parse(_ rawRule: String) -> Rule? {
        let normalized = rawRule.replacingOccurrences(
            of: "^RRULE:", with: "", options: [.regularExpression, .caseInsensitive]
        )
        var values: [String: String] = [:]
        for part in normalized.split(separator: ";") {
            let pair = part.split(separator: "=", maxSplits: 1).map(String.init)
            if pair.count == 2 { values[pair[0].uppercased()] = pair[1].uppercased() }
        }
        guard let frequency = values["FREQ"],
              ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].contains(frequency)
        else { return nil }
        return Rule(
            frequency: frequency,
            interval: max(1, Int(values["INTERVAL"] ?? "1") ?? 1),
            weekdays: Set((values["BYDAY"] ?? "").split(separator: ",").compactMap(weekday)),
            count: values["COUNT"].flatMap(Int.init),
            until: values["UNTIL"].flatMap(parseDate)
        )
    }

    private static func weekday(_ value: Substring) -> Int? {
        ["SU": 1, "MO": 2, "TU": 3, "WE": 4, "TH": 5, "FR": 6, "SA": 7][String(value)]
    }

    private static func parseDate(_ value: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        if value.hasSuffix("Z") {
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
        } else {
            formatter.timeZone = .current
            formatter.dateFormat = value.count == 8 ? "yyyyMMdd" : "yyyyMMdd'T'HHmmss"
        }
        guard let date = formatter.date(from: value) else { return nil }
        return value.count == 8
            ? Calendar.current.date(bySettingHour: 23, minute: 59, second: 59, of: date)
            : date
    }
}
