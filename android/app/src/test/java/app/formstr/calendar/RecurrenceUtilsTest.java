package app.formstr.calendar;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

import java.util.Calendar;
import java.util.List;
import java.util.TimeZone;

public class RecurrenceUtilsTest {

    private static final long DAY = 24L * 60 * 60 * 1000;

    @Test
    public void returnsEveryDailyOccurrenceInWindow() {
        long start = utc(2026, Calendar.JULY, 1, 9);

        List<Long> occurrences = RecurrenceUtils.getOccurrencesInRange(
                start,
                start + 60 * 60 * 1000,
                "FREQ=DAILY",
                start,
                start + 2 * DAY
        );

        assertEquals(3, occurrences.size());
        assertEquals(start, occurrences.get(0).longValue());
        assertEquals(start + DAY, occurrences.get(1).longValue());
        assertEquals(start + 2 * DAY, occurrences.get(2).longValue());
    }

    @Test
    public void respectsCountWhenCollectingOccurrences() {
        long start = utc(2026, Calendar.JULY, 1, 9);

        List<Long> occurrences = RecurrenceUtils.getOccurrencesInRange(
                start,
                start + 60 * 60 * 1000,
                "FREQ=DAILY;COUNT=2",
                start,
                start + 5 * DAY
        );

        assertEquals(2, occurrences.size());
    }

    @Test
    public void respectsWeeklyByDayInterval() {
        long monday = utc(2026, Calendar.JULY, 6, 9);

        List<Long> occurrences = RecurrenceUtils.getOccurrencesInRange(
                monday,
                monday + 60 * 60 * 1000,
                "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE",
                monday,
                monday + 21 * DAY
        );

        assertEquals(4, occurrences.size());
        assertEquals(monday, occurrences.get(0).longValue());
        assertEquals(monday + 2 * DAY, occurrences.get(1).longValue());
        assertEquals(monday + 14 * DAY, occurrences.get(2).longValue());
        assertEquals(monday + 16 * DAY, occurrences.get(3).longValue());
    }

    @Test
    public void monthlyRulesSkipDatesThatDoNotExistWithoutDrifting() {
        long january31 = utc(2026, Calendar.JANUARY, 31, 9);
        long march31 = utc(2026, Calendar.MARCH, 31, 9);

        List<Long> occurrences = RecurrenceUtils.getOccurrencesInRange(
                january31,
                january31 + 60 * 60 * 1000,
                "FREQ=MONTHLY",
                january31,
                utc(2026, Calendar.APRIL, 1, 9)
        );

        assertEquals(2, occurrences.size());
        assertEquals(january31, occurrences.get(0).longValue());
        assertEquals(march31, occurrences.get(1).longValue());
    }

    @Test
    public void nullRruleValuesAreTreatedAsNonRecurring() {
        assertEquals("", NotificationWorker.normalizeRrule(null));
        assertEquals("", NotificationWorker.normalizeRrule(new Object()));
        assertEquals("FREQ=DAILY", NotificationWorker.normalizeRrule(" FREQ=DAILY "));
    }

    private static long utc(int year, int month, int day, int hour) {
        Calendar calendar = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
        calendar.clear();
        calendar.set(year, month, day, hour, 0, 0);
        return calendar.getTimeInMillis();
    }
}
