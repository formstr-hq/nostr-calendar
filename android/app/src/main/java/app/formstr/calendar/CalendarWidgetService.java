package app.formstr.calendar;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import java.util.ArrayList;
import java.util.List;

public class CalendarWidgetService extends RemoteViewsService {

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        int appWidgetId = intent.getIntExtra(
                AppWidgetManager.EXTRA_APPWIDGET_ID,
                AppWidgetManager.INVALID_APPWIDGET_ID
        );
        return new CalendarEventFactory(getApplicationContext(), appWidgetId);
    }

    private static final class CalendarEventFactory implements RemoteViewsFactory {
        private final Context context;
        private final int appWidgetId;
        private List<CalendarWidget.WidgetEvent> events = new ArrayList<>();

        CalendarEventFactory(Context context, int appWidgetId) {
            this.context = context;
            this.appWidgetId = appWidgetId;
        }

        @Override
        public void onCreate() {
            loadEvents();
        }

        @Override
        public void onDataSetChanged() {
            loadEvents();
        }

        private void loadEvents() {
            events = CalendarWidget.getUpcomingEvents(context, appWidgetId);
        }

        @Override
        public int getCount() {
            return events.size();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            if (position < 0 || position >= events.size()) return null;

            CalendarWidget.WidgetEvent event = events.get(position);
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_calendar_event);
            boolean showDay = CalendarWidget.showsDayHeading(events, position);
            views.setViewVisibility(
                    R.id.widget_event_group_gap,
                    showDay && position > 0 ? View.VISIBLE : View.GONE
            );
            views.setViewVisibility(R.id.widget_event_day, showDay ? View.VISIBLE : View.GONE);
            if (showDay) {
                views.setTextViewText(
                        R.id.widget_event_day,
                        CalendarWidget.formatDayHeading(event.displayBegin)
                );
            }
            views.setTextViewText(
                    R.id.widget_event_time,
                    CalendarWidget.formatEventTime(context, event)
            );
            views.setTextViewText(R.id.widget_event_title, event.title);
            views.setOnClickFillInIntent(R.id.widget_event_item, new Intent());
            return views;
        }

        @Override
        public RemoteViews getLoadingView() {
            return null;
        }

        @Override
        public int getViewTypeCount() {
            return 1;
        }

        @Override
        public long getItemId(int position) {
            if (position < 0 || position >= events.size()) return position;
            CalendarWidget.WidgetEvent event = events.get(position);
            return 31L * event.displayBegin + event.title.hashCode();
        }

        @Override
        public boolean hasStableIds() {
            return true;
        }

        @Override
        public void onDestroy() {
            events.clear();
        }
    }
}
