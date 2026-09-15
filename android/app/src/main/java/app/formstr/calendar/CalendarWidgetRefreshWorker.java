package app.formstr.calendar;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/** Keeps widget dates and time-filtered event lists current when launcher updates are deferred. */
public class CalendarWidgetRefreshWorker extends Worker {

    public CalendarWidgetRefreshWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        CalendarWidget.refreshAll(getApplicationContext());
        return Result.success();
    }
}
