import Foundation

final class IOSRelayQueryClient {
    private let timeout: TimeInterval

    init(timeout: TimeInterval = 15) {
        self.timeout = timeout
    }

    func query(relayURL: String, filters: [[String: Any]]) async -> [[String: Any]] {
        guard let url = URL(string: relayURL), !filters.isEmpty else { return [] }

        let task = URLSession.shared.webSocketTask(with: url)
        let subscriptionId = "notification_\(UUID().uuidString)"
        task.resume()

        defer {
            let close = ["CLOSE", subscriptionId]
            if let data = try? JSONSerialization.data(withJSONObject: close),
               let message = String(data: data, encoding: .utf8) {
                task.send(.string(message)) { _ in }
            }
            task.cancel(with: .normalClosure, reason: nil)
        }

        do {
            var request: [Any] = ["REQ", subscriptionId]
            request.append(contentsOf: filters)
            let data = try JSONSerialization.data(withJSONObject: request)
            guard let message = String(data: data, encoding: .utf8) else { return [] }
            try await task.send(.string(message))
        } catch {
            NSLog("Failed to query iOS notification relay \(relayURL): \(error.localizedDescription)")
            return []
        }

        var events: [[String: Any]] = []
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline, !Task.isCancelled {
            do {
                let message = try await receive(task, before: deadline)
                guard case let .string(text) = message,
                      let data = text.data(using: .utf8),
                      let payload = try JSONSerialization.jsonObject(with: data) as? [Any],
                      let type = payload.first as? String
                else { continue }

                if type == "EVENT", payload.count >= 3,
                   let event = payload[2] as? [String: Any] {
                    events.append(event)
                } else if type == "EOSE" {
                    break
                }
            } catch is CancellationError {
                break
            } catch {
                NSLog("iOS notification relay query failed for \(relayURL): \(error.localizedDescription)")
                break
            }
        }
        return events
    }

    private func receive(
        _ task: URLSessionWebSocketTask,
        before deadline: Date
    ) async throws -> URLSessionWebSocketTask.Message {
        let remaining = max(0, deadline.timeIntervalSinceNow)
        return try await withThrowingTaskGroup(of: URLSessionWebSocketTask.Message.self) { group in
            group.addTask { try await task.receive() }
            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(remaining * 1_000_000_000))
                throw CancellationError()
            }
            guard let result = try await group.next() else { throw CancellationError() }
            group.cancelAll()
            return result
        }
    }
}
