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
                ViewThatFits(in: .vertical) {
                    eventList(limit: 5)
                    eventList(limit: 4)
                    eventList(limit: 3)
                    eventList(limit: 2)
                    eventList(limit: 1)
                }
            }
            Spacer(minLength: 0)
        }
        .containerBackground(.background, for: .widget)
        .widgetURL(URL(string: "https://calendar.formstr.app/"))
    }

    private func eventList(limit: Int) -> some View {
        let visibleEvents = Array(entry.events.prefix(limit))
        let hiddenCount = entry.events.count - visibleEvents.count

        return VStack(alignment: .leading, spacing: 5) {
            ForEach(Array(visibleEvents.enumerated()), id: \.element.id) { index, event in
                if showsDayHeading(for: event, at: index, in: visibleEvents) {
                    Text(dayHeading(event.begin))
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .textCase(.uppercase)
                        .tracking(0.8)
                        .lineLimit(1)
                        .padding(.top, index == 0 ? 0 : 2)
                }
                eventRow(event)
            }
            if hiddenCount > 0 {
                Text("+\(hiddenCount) more")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(.secondary)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private func eventRow(_ event: WidgetEvent) -> some View {
        HStack(spacing: 8) {
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
        event.allDay ? "All day" : event.begin.formatted(date: .omitted, time: .shortened)
    }

    private func showsDayHeading(
        for event: WidgetEvent,
        at index: Int,
        in events: [WidgetEvent]
    ) -> Bool {
        let calendar = Calendar.current
        guard !calendar.isDateInToday(event.begin) else { return false }
        guard index > 0 else { return true }
        return !calendar.isDate(event.begin, inSameDayAs: events[index - 1].begin)
    }

    private func dayHeading(_ date: Date) -> String {
        date.formatted(.dateTime.weekday(.wide).month(.wide).day())
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
