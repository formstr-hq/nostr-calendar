import Foundation
import WidgetKit

enum IOSWidgetDataBridge {
    static let appGroup = "group.app.formstr.calendar"
    static let widgetKind = "CalendarWidget"

    private static let storageKeys = [
        "cal:events",
        "cal:calendar_lists",
        "cal:device_events",
        "cal:device_calendars",
    ]

    static func synchronize() {
        guard let sharedDefaults = UserDefaults(suiteName: appGroup) else { return }

        for name in storageKeys {
            let key = "CapacitorStorage.\(name)"
            if let value = UserDefaults.standard.string(forKey: key) {
                sharedDefaults.set(value, forKey: key)
            } else {
                sharedDefaults.removeObject(forKey: key)
            }
        }

        WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
    }
}
