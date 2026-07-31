import Foundation
import UserNotifications

actor IOSIncomingNotificationPoller {
    static let shared = IOSIncomingNotificationPoller()

    private let defaults = UserDefaults.standard
    private let relayClient = IOSRelayQueryClient()
    private let storagePrefix = "CapacitorStorage."
    private let maximumRelays = 3
    private let lookbackSeconds: TimeInterval = 7 * 24 * 60 * 60

    private init() {}

    func refresh() async {
        guard let pubkey = stringValue(for: "bg:userPubkey"),
              let relays = arrayValue(for: "bg:relays"), !relays.isEmpty
        else { return }

        let now = Date().timeIntervalSince1970
        let invitationSince = timestamp(for: "bg:lastInvitationFetchTime", fallback: now - lookbackSeconds)
        let lastLogin = timestamp(for: "bg:lastLoginTime", fallback: now - lookbackSeconds)
        let requestSince = timestamp(for: "bg:lastBookingRequestFetchTime", fallback: lastLogin)
        let responseSince = timestamp(for: "bg:lastBookingResponseFetchTime", fallback: lastLogin)
        let filters = makeFilters(
            pubkey: pubkey,
            invitationSince: invitationSince,
            requestSince: requestSince,
            responseSince: responseSince
        )

        let selectedRelays = Array(relays.prefix(maximumRelays))
        let results = await withTaskGroup(of: [[String: Any]].self, returning: [[String: Any]].self) { group in
            for relay in selectedRelays {
                group.addTask { [relayClient] in
                    await relayClient.query(relayURL: relay, filters: filters)
                }
            }

            var events: [[String: Any]] = []
            for await relayEvents in group {
                events.append(contentsOf: relayEvents)
            }
            return events
        }
        guard !Task.isCancelled else { return }

        let seenInvitations = invitationIdsFromCache()
        var invitationIds = Set<String>()
        var bookingRequestIds = Set<String>()
        var bookingApprovalIds = Set<String>()

        for event in results {
            guard let id = event["id"] as? String, !id.isEmpty else { continue }
            let kind = integer(event["kind"])
            let classifier = tagValue(in: event, name: "k")

            if kind == 1059, classifier == "1052" {
                if !seenInvitations.contains(id), !hasTag(in: event, name: "booking", value: "true") {
                    invitationIds.insert(id)
                }
            } else if kind == 1059, classifier == "1057" {
                bookingRequestIds.insert(id)
            } else if kind == 1059, classifier == "1058", hasTag(in: event, name: "status", value: "approved") {
                bookingApprovalIds.insert(id)
            }
        }

        await postNotifications(
            invitations: invitationIds.count,
            bookingRequests: bookingRequestIds.count,
            bookingApprovals: bookingApprovalIds.count
        )
        guard !Task.isCancelled else { return }

        defaults.set(String(Int(now)), forKey: key("bg:lastInvitationFetchTime"))
        defaults.set(String(Int(now)), forKey: key("bg:lastBookingRequestFetchTime"))
        defaults.set(String(Int(now)), forKey: key("bg:lastBookingResponseFetchTime"))
    }

    private func makeFilters(
        pubkey: String,
        invitationSince: TimeInterval,
        requestSince: TimeInterval,
        responseSince: TimeInterval
    ) -> [[String: Any]] {
        [
            ["kinds": [1059], "#p": [pubkey], "#k": ["1052"], "since": Int(invitationSince)],
            ["kinds": [1059], "#p": [pubkey], "#k": ["1057"], "since": Int(requestSince)],
            ["kinds": [1059], "#p": [pubkey], "#k": ["1058"], "since": Int(responseSince)],
        ]
    }

    private func postNotifications(
        invitations: Int,
        bookingRequests: Int,
        bookingApprovals: Int
    ) async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        let allowed: Set<UNAuthorizationStatus> = [.authorized, .provisional, .ephemeral]
        guard allowed.contains(settings.authorizationStatus) else { return }

        if invitations > 0 {
            await post(
                center: center,
                identifier: "calendar_invitations",
                thread: "calendar_invitations",
                title: "New Calendar Invitation\(invitations > 1 ? "s" : "")",
                body: "You have \(invitations) new invitation\(invitations > 1 ? "s" : "")",
                route: "/notifications"
            )
        }
        if bookingRequests > 0 {
            await post(
                center: center,
                identifier: "booking_requests",
                thread: "booking_requests",
                title: "New Booking Request\(bookingRequests > 1 ? "s" : "")",
                body: "You have \(bookingRequests) new booking request\(bookingRequests > 1 ? "s" : "")",
                route: "/bookings"
            )
        }
        if bookingApprovals > 0 {
            let body = bookingApprovals == 1
                ? "One of your booking requests was accepted"
                : "\(bookingApprovals) of your booking requests were accepted"
            await post(
                center: center,
                identifier: "booking_acceptances",
                thread: "booking_acceptances",
                title: bookingApprovals == 1 ? "Booking Accepted" : "Bookings Accepted",
                body: body,
                route: "/bookings"
            )
        }
    }

    private func post(
        center: UNUserNotificationCenter,
        identifier: String,
        thread: String,
        title: String,
        body: String,
        route: String
    ) async {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.threadIdentifier = thread
        content.userInfo = ["cap_extra": ["openRoute": route]]
        let request = UNNotificationRequest(identifier: identifier, content: content, trigger: nil)

        await withCheckedContinuation { continuation in
            center.add(request) { error in
                if let error {
                    NSLog("Failed to post iOS notification: \(error.localizedDescription)")
                }
                continuation.resume()
            }
        }
    }

    private func invitationIdsFromCache() -> Set<String> {
        guard let value = defaults.string(forKey: key("cal:invitations")),
              let data = value.data(using: .utf8),
              let invitations = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else { return [] }
        return Set(invitations.compactMap { $0["originalInvitationId"] as? String })
    }

    private func stringValue(for name: String) -> String? {
        guard let raw = defaults.string(forKey: key(name)),
              let data = raw.data(using: .utf8),
              let value = try? JSONSerialization.jsonObject(with: data) as? String
        else { return nil }
        return value.isEmpty ? nil : value
    }

    private func arrayValue(for name: String) -> [String]? {
        guard let raw = defaults.string(forKey: key(name)),
              let data = raw.data(using: .utf8),
              let value = try? JSONSerialization.jsonObject(with: data) as? [String]
        else { return nil }
        return value
    }

    private func timestamp(for name: String, fallback: TimeInterval) -> TimeInterval {
        guard let raw = defaults.string(forKey: key(name)) else { return fallback }
        let value = raw.trimmingCharacters(in: CharacterSet(charactersIn: "\" "))
        return TimeInterval(value) ?? fallback
    }

    private func key(_ name: String) -> String {
        storagePrefix + name
    }

    private func integer(_ value: Any?) -> Int? {
        if let value = value as? Int { return value }
        if let value = value as? NSNumber { return value.intValue }
        return nil
    }

    private func hasTag(in event: [String: Any], name: String, value: String) -> Bool {
        tagValue(in: event, name: name) == value
    }

    private func tagValue(in event: [String: Any], name: String) -> String? {
        guard let tags = event["tags"] as? [[Any]] else { return nil }
        return tags.first { tag in tag.count >= 2 && tag[0] as? String == name }?[1] as? String
    }
}
