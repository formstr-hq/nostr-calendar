import Foundation
import UserNotifications

/// Best-effort background polling for cached replaceable event updates.
actor IOSEventUpdatePoller {
    static let shared = IOSEventUpdatePoller()

    private let defaults = UserDefaults.standard
    private let relayClient = IOSRelayQueryClient()
    private let storagePrefix = "CapacitorStorage."
    private let maximumRelays = 3

    private init() {}

    func refresh() async {
        guard var events = jsonArray(for: "cal:events"),
              let currentUser = stringValue(for: "bg:userPubkey")
        else { return }

        let eligible = events.enumerated().filter { isEligible($0.element) }
        guard !eligible.isEmpty else { return }
        let filters = batchFilters(for: eligible.map { $0.element })
        guard !filters.isEmpty else { return }
        let expectedCoordinates = Set(eligible.compactMap { coordinate(forCached: $0.element) })
        let relayHints = eligible.compactMap { $0.element["relayHint"] as? String }
        let relays = unique(relayHints + (arrayValue(for: "bg:relays") ?? []))
        guard !relays.isEmpty else { return }

        let selectedRelays = Array(relays.prefix(maximumRelays))
        let received = await withTaskGroup(of: [[String: Any]].self, returning: [[String: Any]].self) { group in
            for relay in selectedRelays {
                group.addTask { [relayClient] in
                    await relayClient.query(relayURL: relay, filters: filters)
                }
            }
            var all: [[String: Any]] = []
            for await result in group { all.append(contentsOf: result) }
            return all
        }
        guard !Task.isCancelled else { return }

        var latest: [String: [String: Any]] = [:]
        for event in received {
            guard let coordinate = coordinate(for: event), let createdAt = number(event["created_at"])
            else { continue }
            guard expectedCoordinates.contains(coordinate) else { continue }
            if let existing = latest[coordinate], number(existing["created_at"]) ?? 0 >= createdAt { continue }
            latest[coordinate] = event
        }

        var changed = false
        var scheduleChanged = false
        var notifications: [(event: [String: Any], body: String)] = []
        for (index, cached) in events.enumerated() {
            guard isEligible(cached),
                  let coordinate = coordinate(forCached: cached),
                  let fresh = latest[coordinate],
                  (number(fresh["created_at"]) ?? 0) > (number(cached["createdAt"]) ?? 0),
                  let updated = parsePrivate(event: fresh, cached: cached)
            else { continue }

            let update = compare(previous: cached, fresh: updated)
            events[index] = updated
            changed = true
            scheduleChanged = scheduleChanged || update.scheduleChanged
            if shouldNotify(previous: cached, fresh: updated, currentUser: currentUser, update: update) {
                notifications.append((updated, update.body))
            }
        }

        guard changed else { return }
        setJSONArray(events, for: "cal:events")
        IOSWidgetDataBridge.synchronize()
        if scheduleChanged {
            await IOSNotificationScheduler.shared.reconcileAsync()
        }
        for notification in notifications {
            await post(event: notification.event, body: notification.body)
        }
    }

    private func isEligible(_ event: [String: Any]) -> Bool {
        guard event["source"] as? String != "device",
              event["isPrivateEvent"] as? Bool == true,
              event["isInvitation"] as? Bool != true,
              let viewKey = event["viewKey"] as? String, !viewKey.isEmpty,
              let id = event["id"] as? String, !id.isEmpty,
              let user = event["user"] as? String, !user.isEmpty
        else { return false }
        let recurring = ((event["repeat"] as? [String: Any])?["rrule"] as? String)?.isEmpty == false
        return recurring || (number(event["end"]) ?? 0) > Date().timeIntervalSince1970 * 1_000
    }

    private func batchFilters(for events: [[String: Any]]) -> [[String: Any]] {
        var grouped: [String: [String: Any]] = [:]
        for event in events {
            guard let kind = number(event["kind"]).map({ Int($0) }), kind != 0,
                  let author = event["user"] as? String, !author.isEmpty,
                  let identifier = event["id"] as? String, !identifier.isEmpty
            else { continue }
            let key = "\(kind):\(author)"
            var filter = grouped[key] ?? ["kinds": [kind], "authors": [author], "#d": [String]()]
            var identifiers = filter["#d"] as? [String] ?? []
            if !identifiers.contains(identifier) { identifiers.append(identifier) }
            filter["#d"] = identifiers
            grouped[key] = filter
        }
        return Array(grouped.values)
    }

    private func coordinate(forCached event: [String: Any]) -> String? {
        guard let kind = number(event["kind"]), let author = event["user"] as? String,
              let identifier = event["id"] as? String
        else { return nil }
        return "\(Int(kind)):\(author):\(identifier)"
    }

    private func coordinate(for event: [String: Any]) -> String? {
        guard let kind = number(event["kind"]), let author = event["pubkey"] as? String,
              let tags = event["tags"] as? [[Any]], let identifier = tag(tags, name: "d"), !identifier.isEmpty
        else { return nil }
        return "\(Int(kind)):\(author):\(identifier)"
    }

    private func parsePrivate(event: [String: Any], cached: [String: Any]) -> [String: Any]? {
        guard let viewKey = cached["viewKey"] as? String,
              let content = event["content"] as? String,
              let id = event["id"] as? String,
              let kind = number(event["kind"]),
              let author = event["pubkey"] as? String,
              let createdAt = number(event["created_at"]),
              let plaintext = try? Nip44.decrypt(nsec: viewKey, payload: content),
              let data = plaintext.data(using: .utf8),
              let tags = try? JSONSerialization.jsonObject(with: data) as? [[Any]],
              let begin = seconds(tag(tags, name: "start")),
              let end = seconds(tag(tags, name: "end"))
        else { return nil }
        var parsed = cached
        parsed["eventId"] = id
        parsed["kind"] = Int(kind)
        parsed["user"] = author
        parsed["id"] = tag(tags, name: "d") ?? ""
        parsed["createdAt"] = createdAt
        parsed["title"] = tag(tags, name: "title") ?? tag(tags, name: "name") ?? ""
        parsed["description"] = tag(tags, name: "description") ?? ""
        parsed["begin"] = begin
        parsed["end"] = end
        parsed["allDay"] = isAllDay(begin: begin, end: end)
        parsed["image"] = tag(tags, name: "image") ?? ""
        parsed["location"] = tagValues(named: "location", in: tags)
        parsed["participants"] = tagValues(named: "p", in: tags)
        parsed["categories"] = tagValues(named: "t", in: tags)
        parsed["reference"] = tagValues(named: "r", in: tags)
        parsed["forms"] = forms(in: tags)
        if let recurrence = recurrenceRule(in: tags), !recurrence.isEmpty {
            parsed["repeat"] = ["rrule": recurrence]
        } else {
            parsed["repeat"] = ["rrule": NSNull()]
        }
        if let preference = tag(tags, name: "notification"), ["enabled", "disabled"].contains(preference) {
            parsed["notificationPreference"] = preference
        } else {
            parsed.removeValue(forKey: "notificationPreference")
        }
        return parsed
    }

    private func compare(previous: [String: Any], fresh: [String: Any]) -> (changed: [String], timeChanged: Bool, scheduleChanged: Bool, body: String) {
        var changed: [String] = []
        let timeChanged = number(previous["begin"]) != number(fresh["begin"]) || number(previous["end"]) != number(fresh["end"])
        if timeChanged { changed.append("date and time") }
        for (key, label) in [("title", "title"), ("description", "description")] where string(previous[key]) != string(fresh[key]) {
            changed.append(label)
        }
        if set(previous["location"]) != set(fresh["location"]) { changed.append("location") }
        if string(previous["image"]) != string(fresh["image"]) { changed.append("image") }
        let recurrenceChanged = repeatRule(previous) != repeatRule(fresh)
        if recurrenceChanged { changed.append("recurrence") }
        for (key, label) in [("categories", "categories"), ("reference", "references")] where set(previous[key]) != set(fresh[key]) {
            changed.append(label)
        }
        if formSet(previous["forms"]) != formSet(fresh["forms"]) { changed.append("forms") }
        let notificationPreferenceChanged = string(previous["notificationPreference"]) != string(fresh["notificationPreference"])
        if notificationPreferenceChanged { changed.append("notification preference") }
        let added = set(fresh["participants"]).subtracting(set(previous["participants"]))
        if !added.isEmpty { changed.append("participants") }
        let body: String
        if timeChanged {
            body = "New time: \(formatRange(begin: number(fresh["begin"]) ?? 0, end: number(fresh["end"]) ?? 0))"
        } else if !added.isEmpty && changed.count == 1 {
            body = added.count == 1 ? "A participant was added" : "\(added.count) participants were added"
        } else {
            body = changed.isEmpty ? "" : "Updated: \(changed.joined(separator: ", "))"
        }
        return (changed, timeChanged, timeChanged || recurrenceChanged || notificationPreferenceChanged, body)
    }

    private func shouldNotify(previous: [String: Any], fresh: [String: Any], currentUser: String, update: (changed: [String], timeChanged: Bool, scheduleChanged: Bool, body: String)) -> Bool {
        guard !update.changed.isEmpty, string(fresh["user"]).lowercased() != currentUser.lowercased() else { return false }
        let before = set(previous["participants"])
        return !before.contains(currentUser.lowercased()) || set(fresh["participants"]).contains(currentUser.lowercased())
    }

    private func post(event: [String: Any], body: String) async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        guard [.authorized, .provisional, .ephemeral].contains(settings.authorizationStatus), let identifier = event["id"] as? String else { return }
        let key = "event-update:\(number(event["kind"]) ?? 0):\(string(event["user"])):\(identifier):\(string(event["eventId"]))"
        let content = UNMutableNotificationContent()
        content.title = "\(string(event["title"]).isEmpty ? "Calendar event" : string(event["title"])) was updated"
        content.body = body
        content.sound = .default
        content.threadIdentifier = "event_updates"
        content.userInfo = ["cap_extra": ["openRoute": "/notification-event/\(identifier)"]]
        let request = UNNotificationRequest(identifier: key, content: content, trigger: nil)
        await withCheckedContinuation { continuation in center.add(request) { _ in continuation.resume() } }
    }

    private func key(_ name: String) -> String { storagePrefix + name }
    private func stringValue(for name: String) -> String? {
        guard let raw = defaults.string(forKey: key(name)),
              let data = raw.data(using: .utf8),
              let value = try? JSONSerialization.jsonObject(with: data) as? String
        else { return nil }
        return value.isEmpty ? nil : value
    }
    private func jsonArray(for name: String) -> [[String: Any]]? {
        guard let raw = defaults.string(forKey: key(name)),
              let data = raw.data(using: .utf8)
        else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
    }
    private func setJSONArray(_ value: [[String: Any]], for name: String) { guard let data = try? JSONSerialization.data(withJSONObject: value), let raw = String(data: data, encoding: .utf8) else { return }; defaults.set(raw, forKey: key(name)) }
    private func arrayValue(for name: String) -> [String]? {
        guard let raw = defaults.string(forKey: key(name)),
              let data = raw.data(using: .utf8)
        else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String]
    }
    private func number(_ value: Any?) -> Double? { if let value = value as? NSNumber { return value.doubleValue }; if let value = value as? String { return Double(value) }; return nil }
    private func string(_ value: Any?) -> String { value as? String ?? "" }
    private func seconds(_ value: String?) -> Double? { value.flatMap(Double.init).map { $0 * 1_000 } }
    private func tag(_ tags: [[Any]], name: String) -> String? { tags.first { ($0.first as? String) == name }?[safe: 1] as? String }
    private func tagValues(named name: String, in tags: [[Any]]) -> [String] { tags.compactMap { ($0.first as? String) == name ? $0[safe: 1] as? String : nil } }
    private func recurrenceRule(in tags: [[Any]]) -> String? {
        for index in 0..<(max(0, tags.count - 1)) {
            let label = tags[index]
            let value = tags[index + 1]
            if label.first as? String == "L", label[safe: 1] as? String == "rrule", value.first as? String == "l" {
                return value[safe: 1] as? String
            }
        }
        return nil
    }
    private func forms(in tags: [[Any]]) -> [[String: Any]] {
        tags.compactMap { current in
            guard current.first as? String == "form", let naddr = current[safe: 1] as? String, !naddr.isEmpty else { return nil }
            var form: [String: Any] = ["naddr": naddr]
            if let viewKey = current[safe: 2] as? String, !viewKey.isEmpty { form["viewKey"] = viewKey }
            return form
        }
    }
    private func repeatRule(_ event: [String: Any]) -> String { string((event["repeat"] as? [String: Any])?["rrule"]) }
    private func formSet(_ value: Any?) -> Set<String> {
        let forms = value as? [[String: Any]] ?? []
        return Set(forms.compactMap { form in
            let naddr = string(form["naddr"])
            return naddr.isEmpty ? nil : "\(naddr)\u{0}\(string(form["viewKey"]))"
        })
    }
    private func isAllDay(begin: Double, end: Double) -> Bool {
        guard end > begin else { return false }
        let calendar = Calendar.current
        let start = calendar.dateComponents([.hour, .minute], from: Date(timeIntervalSince1970: begin / 1_000))
        let finish = calendar.dateComponents([.hour, .minute], from: Date(timeIntervalSince1970: end / 1_000))
        return start.hour == 0 && start.minute == 0 && finish.hour == 0 && finish.minute == 0
    }
    private func set(_ value: Any?) -> Set<String> { Set((value as? [String] ?? []).map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }.filter { !$0.isEmpty }) }
    private func unique(_ values: [String]) -> [String] { Array(NSOrderedSet(array: values).compactMap { $0 as? String }) }
    private func formatRange(begin: Double, end: Double) -> String { let formatter = DateFormatter(); formatter.dateStyle = .medium; formatter.timeStyle = .short; return "\(formatter.string(from: Date(timeIntervalSince1970: begin / 1_000))) - \(DateFormatter.localizedString(from: Date(timeIntervalSince1970: end / 1_000), dateStyle: .none, timeStyle: .short))" }
}

private extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}
