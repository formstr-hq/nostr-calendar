import BackgroundTasks
import Foundation

final class IOSBackgroundNotificationCoordinator {
    static let shared = IOSBackgroundNotificationCoordinator()

    private let scheduler = IOSNotificationScheduler.shared
    private let poller = IOSIncomingNotificationPoller.shared

    private init() {}

    func registerBackgroundRefresh() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: scheduler.refreshIdentifier,
            using: nil
        ) { [weak self] task in
            guard let self, let refreshTask = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            self.handle(refreshTask)
        }
    }

    func scheduleBackgroundRefresh() {
        scheduler.scheduleBackgroundRefresh()
    }

    func refresh() {
        Task { [weak self] in
            await self?.refreshNow()
        }
    }

    private func handle(_ task: BGAppRefreshTask) {
        scheduleBackgroundRefresh()
        let lock = NSLock()
        var completed = false
        var operation: Task<Void, Never>?
        let finish: (Bool) -> Void = { success in
            lock.lock()
            defer { lock.unlock() }
            guard !completed else { return }
            completed = true
            task.setTaskCompleted(success: success)
        }

        task.expirationHandler = {
            operation?.cancel()
            finish(false)
        }
        operation = Task { [weak self] in
            await self?.refreshNow()
            finish(!Task.isCancelled)
        }
    }

    private func refreshNow() async {
        await scheduler.reconcileAsync()
        guard !Task.isCancelled else { return }
        await poller.refresh()
    }
}
