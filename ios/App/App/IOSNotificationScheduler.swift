import BackgroundTasks
import Foundation
import UserNotifications

final class IOSNotificationScheduler {
    static let shared = IOSNotificationScheduler()

    private let eventKey = "CapacitorStorage.cal:events"
    private let calendarKey = "CapacitorStorage.cal:calendar_lists"
    private let preferenceKey = "CapacitorStorage.cal:notification-preferences"
    private let notificationKeyPrefix = "v2:"
    private let scheduleWindow: TimeInterval = 2 * 24 * 60 * 60
    private let refreshInterval: TimeInterval = 6 * 60 * 60
    private let maximumPendingNotifications = 64
    private let defaultOffsets = [10, 0]

    private var refreshIdentifier: String {
        let bundleIdentifier = Bundle.main.bundleIdentifier ?? "app.formstr.calendar"
        return "\(bundleIdentifier).notification-refresh"
    }

    private struct Candidate {
        let key: String
        let identifier: String
        let eventId: String
        let title: String
        let body: String
        let scheduledAt: Date
    }

    private struct Rule {
        let frequency: String
        let interval: Int
        let weekdays: Set<Int>
        let count: Int?
        let until: Date?
    }

    private init() {}

    func registerBackgroundRefresh() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: refreshIdentifier,
            using: nil
        ) { [weak self] task in
            guard let self, let refreshTask = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }

            self.scheduleBackgroundRefresh()
            var completed = false
            refreshTask.expirationHandler = {
                guard !completed else { return }
                completed = true
                refreshTask.setTaskCompleted(success: false)
            }
            self.reconcile {
                guard !completed else { return }
                completed = true
                refreshTask.setTaskCompleted(success: true)
            }
        }
    }

    func scheduleBackgroundRefresh() {
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: refreshIdentifier)
        let request = BGAppRefreshTaskRequest(identifier: refreshIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: refreshInterval)
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            NSLog("Failed to schedule iOS notification refresh: \(error.localizedDescription)")
        }
    }

    func reconcile(completion: @escaping () -> Void = {}) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { [weak self] settings in
            guard let self else {
                completion()
                return
            }

            let allowedStatuses: Set<UNAuthorizationStatus> = [
                .authorized,
                .provisional,
                .ephemeral,
            ]
            guard allowedStatuses.contains(settings.authorizationStatus) else {
                self.removePendingEventNotifications(center: center, completion: completion)
                return
            }

            let desired = self.buildDesiredNotifications(now: Date())
            center.getPendingNotificationRequests { requests in
                let eventRequests = requests.filter { self.isEventNotification($0) }
                center.removePendingNotificationRequests(
                    withIdentifiers: eventRequests.map(\.identifier)
                )

                let nonEventCount = requests.count - eventRequests.count
                let availableSlots = max(0, self.maximumPendingNotifications - nonEventCount)
                let selected = Array(desired.prefix(availableSlots))
                guard !selected.isEmpty else {
                    completion()
                    return
                }

                let group = DispatchGroup()
                for candidate in selected {
                    group.enter()
                    center.add(self.makeRequest(candidate)) { error in
                        if let error {
                            NSLog("Failed to schedule iOS event notification: \(error.localizedDescription)")
                        }
                        group.leave()
                    }
                }
                group.notify(queue: .main, execute: completion)
            }
        }
    }

    private func removePendingEventNotifications(
        center: UNUserNotificationCenter,
        completion: @escaping () -> Void
    ) {
        center.getPendingNotificationRequests { [weak self] requests in
            guard let self else {
                completion()
                return
            }
            let ids = requests.filter { self.isEventNotification($0) }.map(\.identifier)
            center.removePendingNotificationRequests(withIdentifiers: ids)
            completion()
        }
    }

    private func isEventNotification(_ request: UNNotificationRequest) -> Bool {
        let extra = request.content.userInfo["cap_extra"] as? [String: Any]
        let key = extra?["notificationKey"] as? String
        return key?.hasPrefix(notificationKeyPrefix) == true
    }

    private func makeRequest(_ candidate: Candidate) -> UNNotificationRequest {
        let content = UNMutableNotificationContent()
        content.title = candidate.title
        content.body = candidate.body
        content.sound = .default
        content.userInfo = [
            "cap_extra": [
                "eventId": candidate.eventId,
                "notificationKey": candidate.key,
            ],
            "cap_schedule": ["at": candidate.scheduledAt],
        ]

        let components = Calendar.current.dateComponents(
            [.year, .month, .day, .hour, .minute, .second],
            from: candidate.scheduledAt
        )
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        return UNNotificationRequest(
            identifier: candidate.identifier,
            content: content,
            trigger: trigger
        )
    }

    private func buildDesiredNotifications(now: Date) -> [Candidate] {
        let events = jsonArray(forKey: eventKey)
        let calendars = jsonArray(forKey: calendarKey)
        let preferences = jsonObject(forKey: preferenceKey)
        let scheduleEnd = now.addingTimeInterval(scheduleWindow)
        var candidates: [Candidate] = []

        for event in events {
            guard shouldSchedule(event: event, calendars: calendars),
                  let eventId = event["id"] as? String,
                  !eventId.isEmpty,
                  let beginMilliseconds = number(event["begin"]),
                  let title = event["title"] as? String
            else { continue }

            let offsets = reminderOffsets(eventId: eventId, preferences: preferences)
            guard !offsets.isEmpty else { continue }
            let begin = Date(timeIntervalSince1970: beginMilliseconds / 1_000)
            let maximumOffset = TimeInterval(offsets.max() ?? 0) * 60
            let occurrenceEnd = scheduleEnd.addingTimeInterval(maximumOffset)
            let ruleValue = (event["repeat"] as? [String: Any])?["rrule"]
            let rrule = ruleValue as? String
            let occurrences = occurrenceDates(
                begin: begin,
                rrule: rrule,
                rangeStart: now,
                rangeEnd: occurrenceEnd
            )
            let location = firstLocation(event)

            for occurrence in occurrences {
                for offset in offsets {
                    let scheduledAt = occurrence.addingTimeInterval(TimeInterval(-offset * 60))
                    guard scheduledAt > now && scheduledAt <= scheduleEnd else { continue }
                    let occurrenceMilliseconds = Int64(occurrence.timeIntervalSince1970 * 1_000)
                    let key = "\(notificationKeyPrefix)\(eventId):\(occurrenceMilliseconds):m\(offset)"
                    let bodyPrefix = offset == 0
                        ? "Starting now"
                        : "Starts in \(offset) minute\(offset == 1 ? "" : "s")"
                    let body = location.map { "\(bodyPrefix) at \($0)" } ?? bodyPrefix
                    candidates.append(Candidate(
                        key: key,
                        identifier: String(hashToNumber(key)),
                        eventId: eventId,
                        title: offset == 0 ? title : "Upcoming: \(title)",
                        body: body,
                        scheduledAt: scheduledAt
                    ))
                }
            }
        }

        return candidates.sorted { left, right in
            if left.scheduledAt == right.scheduledAt { return left.key < right.key }
            return left.scheduledAt < right.scheduledAt
        }
    }

    private func reminderOffsets(
        eventId: String,
        preferences: [String: Any]
    ) -> [Int] {
        guard let eventPreference = preferences[eventId] as? [String: Any],
              let configured = eventPreference["offsetsMinutes"] as? [Any]
        else { return defaultOffsets }

        return Array(Set(configured.compactMap { value in
            guard let number = number(value) else { return nil }
            let offset = Int(number.rounded(.down))
            return offset >= 0 ? offset : nil
        })).sorted(by: >)
    }

    private func shouldSchedule(
        event: [String: Any],
        calendars: [[String: Any]]
    ) -> Bool {
        if let preference = event["notificationPreference"] as? String {
            if preference == "enabled" { return true }
            if preference == "disabled" { return false }
        }

        guard let calendar = findCalendar(for: event, calendars: calendars) else { return true }
        return (calendar["notificationPreference"] as? String) != "disabled"
    }

    private func findCalendar(
        for event: [String: Any],
        calendars: [[String: Any]]
    ) -> [String: Any]? {
        let calendarId = event["calendarId"] as? String
        let kind = Int(number(event["kind"]) ?? 0)
        let user = event["user"] as? String ?? ""
        let eventId = event["id"] as? String ?? ""
        let coordinate = "\(kind):\(user):\(eventId)"

        return calendars.first { calendar in
            if let calendarId, calendar["id"] as? String == calendarId { return true }
            guard let refs = calendar["eventRefs"] as? [[Any]] else { return false }
            return refs.contains { ($0.first as? String) == coordinate }
        }
    }

    private func firstLocation(_ event: [String: Any]) -> String? {
        guard let locations = event["location"] as? [Any] else { return nil }
        return locations.compactMap { $0 as? String }.first { !$0.isEmpty }
    }

    private func occurrenceDates(
        begin: Date,
        rrule: String?,
        rangeStart: Date,
        rangeEnd: Date
    ) -> [Date] {
        guard let rrule, !rrule.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return begin >= rangeStart && begin <= rangeEnd ? [begin] : []
        }
        guard let rule = parseRule(rrule) else { return [] }

        if rule.frequency == "WEEKLY" && !rule.weekdays.isEmpty {
            return weekdayOccurrences(
                begin: begin,
                rule: rule,
                rangeStart: rangeStart,
                rangeEnd: rangeEnd
            )
        }

        var result: [Date] = []
        var occurrenceNumber = 0
        for period in 0..<1_000_000 {
            guard let candidate = occurrenceForPeriod(begin: begin, rule: rule, period: period) else {
                continue
            }
            if candidate > rangeEnd { break }
            occurrenceNumber += 1
            if let count = rule.count, occurrenceNumber > count { break }
            if let until = rule.until, candidate > until { break }
            if candidate >= rangeStart { result.append(candidate) }
        }
        return result
    }

    private func weekdayOccurrences(
        begin: Date,
        rule: Rule,
        rangeStart: Date,
        rangeEnd: Date
    ) -> [Date] {
        let calendar = Calendar.current
        var result: [Date] = []
        var occurrenceNumber = 0
        var candidate = begin

        for _ in 0..<100_000 where candidate <= rangeEnd {
            if let until = rule.until, candidate > until { break }
            let weekday = calendar.component(.weekday, from: candidate)
            if rule.weekdays.contains(weekday)
                && isActiveWeek(begin: begin, candidate: candidate, interval: rule.interval) {
                occurrenceNumber += 1
                if let count = rule.count, occurrenceNumber > count { break }
                if candidate >= rangeStart { result.append(candidate) }
            }
            guard let next = calendar.date(byAdding: .day, value: 1, to: candidate) else { break }
            candidate = next
        }
        return result
    }

    private func isActiveWeek(begin: Date, candidate: Date, interval: Int) -> Bool {
        guard interval > 1 else { return true }
        let calendar = Calendar(identifier: .iso8601)
        let beginWeek = calendar.dateInterval(of: .weekOfYear, for: begin)?.start ?? begin
        let candidateWeek = calendar.dateInterval(of: .weekOfYear, for: candidate)?.start ?? candidate
        let weeks = calendar.dateComponents(
            [.weekOfYear],
            from: beginWeek,
            to: candidateWeek
        ).weekOfYear ?? 0
        return weeks >= 0 && weeks % interval == 0
    }

    private func occurrenceForPeriod(begin: Date, rule: Rule, period: Int) -> Date? {
        let amount = rule.interval * period
        let calendar = Calendar.current
        switch rule.frequency {
        case "DAILY":
            return calendar.date(byAdding: .day, value: amount, to: begin)
        case "WEEKLY":
            return calendar.date(byAdding: .weekOfYear, value: amount, to: begin)
        case "MONTHLY":
            return dateByAddingMonths(begin: begin, months: amount)
        case "YEARLY":
            return dateByAddingYears(begin: begin, years: amount)
        default:
            return nil
        }
    }

    private func dateByAddingMonths(begin: Date, months: Int) -> Date? {
        let calendar = Calendar.current
        let original = calendar.dateComponents(
            [.year, .month, .day, .hour, .minute, .second, .nanosecond],
            from: begin
        )
        guard let monthStart = calendar.date(from: DateComponents(
            year: original.year,
            month: original.month,
            day: 1,
            hour: original.hour,
            minute: original.minute,
            second: original.second,
            nanosecond: original.nanosecond
        )), let targetMonth = calendar.date(byAdding: .month, value: months, to: monthStart)
        else { return nil }

        var target = calendar.dateComponents([.year, .month], from: targetMonth)
        target.day = original.day
        target.hour = original.hour
        target.minute = original.minute
        target.second = original.second
        target.nanosecond = original.nanosecond
        guard let date = calendar.date(from: target),
              calendar.component(.day, from: date) == original.day
        else { return nil }
        return date
    }

    private func dateByAddingYears(begin: Date, years: Int) -> Date? {
        let calendar = Calendar.current
        let original = calendar.dateComponents(
            [.year, .month, .day, .hour, .minute, .second, .nanosecond],
            from: begin
        )
        guard let originalYear = original.year else { return nil }
        var target = original
        target.year = originalYear + years
        guard let date = calendar.date(from: target),
              calendar.component(.month, from: date) == original.month,
              calendar.component(.day, from: date) == original.day
        else { return nil }
        return date
    }

    private func parseRule(_ rawRule: String) -> Rule? {
        let normalized = rawRule.replacingOccurrences(
            of: "^RRULE:",
            with: "",
            options: [.regularExpression, .caseInsensitive]
        )
        var values: [String: String] = [:]
        for part in normalized.split(separator: ";") {
            let pair = part.split(separator: "=", maxSplits: 1).map(String.init)
            if pair.count == 2 { values[pair[0].uppercased()] = pair[1].uppercased() }
        }
        guard let frequency = values["FREQ"],
              ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].contains(frequency)
        else { return nil }

        let interval = max(1, Int(values["INTERVAL"] ?? "1") ?? 1)
        let weekdays = Set((values["BYDAY"] ?? "").split(separator: ",").compactMap {
            weekdayNumber(String($0))
        })
        let count = values["COUNT"].flatMap(Int.init)
        let until = values["UNTIL"].flatMap(parseRruleDate)
        return Rule(
            frequency: frequency,
            interval: interval,
            weekdays: weekdays,
            count: count,
            until: until
        )
    }

    private func weekdayNumber(_ value: String) -> Int? {
        switch value {
        case "SU": return 1
        case "MO": return 2
        case "TU": return 3
        case "WE": return 4
        case "TH": return 5
        case "FR": return 6
        case "SA": return 7
        default: return nil
        }
    }

    private func parseRruleDate(_ value: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")

        if value.hasSuffix("Z") {
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
            return formatter.date(from: value)
        }
        if value.count == 15 {
            formatter.timeZone = .current
            formatter.dateFormat = "yyyyMMdd'T'HHmmss"
            return formatter.date(from: value)
        }
        if value.count == 8 {
            formatter.timeZone = .current
            formatter.dateFormat = "yyyyMMdd"
            guard let date = formatter.date(from: value) else { return nil }
            return Calendar.current.date(bySettingHour: 23, minute: 59, second: 59, of: date)
        }
        return nil
    }

    private func hashToNumber(_ value: String) -> Int {
        var hash: Int32 = 0
        for unit in value.utf16 {
            hash = hash &* 31 &+ Int32(unit)
        }
        if hash == Int32.min { return Int(Int32.max) }
        let positive = abs(Int(hash))
        return positive == 0 ? 1 : positive
    }

    private func jsonArray(forKey key: String) -> [[String: Any]] {
        guard let value = UserDefaults.standard.string(forKey: key),
              let data = value.data(using: .utf8),
              let result = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else { return [] }
        return result
    }

    private func jsonObject(forKey key: String) -> [String: Any] {
        guard let value = UserDefaults.standard.string(forKey: key),
              let data = value.data(using: .utf8),
              let result = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return [:] }
        return result
    }

    private func number(_ value: Any?) -> Double? {
        if let number = value as? NSNumber { return number.doubleValue }
        if let number = value as? Double { return number }
        if let number = value as? Int { return Double(number) }
        return nil
    }
}
