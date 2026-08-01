import SwiftUI
import WidgetKit

struct CalendarWidgetEntry: TimelineEntry {
    let date: Date
    let events: [WidgetEvent]
}

struct CalendarWidgetProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> CalendarWidgetEntry {
        CalendarWidgetEntry(date: Date(), events: [
            WidgetEvent(id: "placeholder", title: "Upcoming event", begin: Date(), allDay: false),
        ])
    }

    func snapshot(for configuration: CalendarWidgetIntent, in context: Context) async -> CalendarWidgetEntry {
        entry(for: configuration)
    }

    func timeline(for configuration: CalendarWidgetIntent, in context: Context) async -> Timeline<CalendarWidgetEntry> {
        let entry = entry(for: configuration)
        let refresh = Calendar.current.date(byAdding: .minute, value: 30, to: entry.date)
            ?? entry.date.addingTimeInterval(30 * 60)
        return Timeline(entries: [entry], policy: .after(refresh))
    }

    private func entry(for configuration: CalendarWidgetIntent) -> CalendarWidgetEntry {
        let now = Date()
        return CalendarWidgetEntry(
            date: now,
            events: WidgetDataStore.upcomingEvents(selected: configuration.calendars.map(\.id), now: now)
        )
    }
}

struct CalendarWidgetView: View {
    let entry: CalendarWidgetEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(entry.date.formatted(.dateTime.weekday(.wide)))
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
                .tracking(1.2)
            Text(entry.date.formatted(.dateTime.month(.wide).day()))
                .font(.system(size: 20, weight: .bold))
                .padding(.bottom, 8)
            Divider()
                .padding(.bottom, 8)

            if entry.events.isEmpty {
                Text("No upcoming events")
                    .font(.system(size: 11))
                    .foregroundStyle(.tertiary)
            } else {
                ForEach(Array(entry.events.enumerated()), id: \.element.id) { index, event in
                    eventRow(event)
                    if index < entry.events.count - 1 { Spacer(minLength: 5) }
                }
            }
            Spacer(minLength: 0)
        }
        .containerBackground(.background, for: .widget)
        .widgetURL(URL(string: "https://calendar.formstr.app/"))
    }

    private func eventRow(_ event: WidgetEvent) -> some View {
        HStack(spacing: 8) {
            Circle()
                .fill(.primary)
                .frame(width: 6, height: 6)
            Text(eventTime(event))
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
                .frame(width: 62, alignment: .leading)
            Text(event.title)
                .font(.system(size: 12, weight: .bold))
                .lineLimit(1)
        }
    }

    private func eventTime(_ event: WidgetEvent) -> String {
        let calendar = Calendar.current
        if event.allDay {
            if calendar.isDateInToday(event.begin) { return "All day" }
            if calendar.isDateInTomorrow(event.begin) { return "Tomorrow" }
            return event.begin.formatted(.dateTime.weekday(.abbreviated))
        }
        if calendar.isDateInToday(event.begin) {
            return event.begin.formatted(date: .omitted, time: .shortened)
        }
        if calendar.isDateInTomorrow(event.begin) { return "Tomorrow" }
        return event.begin.formatted(.dateTime.weekday(.abbreviated))
    }
}

struct FormstrCalendarWidget: Widget {
    let kind = "CalendarWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: CalendarWidgetIntent.self, provider: CalendarWidgetProvider()) {
            entry in CalendarWidgetView(entry: entry)
        }
        .configurationDisplayName("Calendar by Form*")
        .description("Shows upcoming events from your selected calendars.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct CalendarWidgetBundle: WidgetBundle {
    var body: some Widget {
        FormstrCalendarWidget()
    }
}
