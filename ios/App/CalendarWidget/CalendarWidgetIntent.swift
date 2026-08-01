import AppIntents
import Foundation

struct CalendarChoice: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Calendar"
    static var defaultQuery = CalendarChoiceQuery()

    let id: String
    let name: String
    let source: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)", subtitle: "\(source)")
    }
}

struct CalendarChoiceQuery: EntityQuery {
    func entities(for identifiers: [CalendarChoice.ID]) async throws -> [CalendarChoice] {
        let identifiers = Set(identifiers)
        return WidgetDataStore.calendarChoices().filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [CalendarChoice] {
        WidgetDataStore.calendarChoices()
    }
}

struct CalendarWidgetIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Calendar"
    static var description = IntentDescription("Choose calendars to show in the widget.")

    @Parameter(title: "Calendars")
    var calendars: [CalendarChoice]

    init() {
        calendars = []
    }
}
