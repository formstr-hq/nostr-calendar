package app.formstr.calendar;

import java.util.Calendar;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

final class RecurrenceUtils {

    private RecurrenceUtils() {
        // Utility class
    }

    /**
     * Compute the next occurrence of a recurring event within [rangeStart, rangeEnd].
     * Supports the recurrence rules produced by the app.
     * Returns -1 if no occurrence falls in the range.
     */
    static long getNextOccurrenceInRange(
            long begin,
            long end,
            String rrule,
            long rangeStart,
            long rangeEnd
    ) {
        String normalized = rrule.replaceFirst("(?i)^RRULE:", "").trim();

        String freq = null;
        int interval = 1;
        String byDay = null;
        Integer count = null;
        long until = -1L;

        for (String part : normalized.split(";")) {
            String[] kv = part.split("=", 2);
            if (kv.length != 2) continue;
            switch (kv[0].toUpperCase()) {
                case "FREQ":
                    freq = kv[1].toUpperCase();
                    break;
                case "INTERVAL":
                    try {
                        interval = Integer.parseInt(kv[1]);
                    } catch (NumberFormatException ignored) {
                        interval = 1;
                    }
                    break;
                case "BYDAY":
                    byDay = kv[1].toUpperCase();
                    break;
                case "COUNT":
                    try {
                        count = Integer.parseInt(kv[1]);
                    } catch (NumberFormatException ignored) {
                        count = null;
                    }
                    break;
                case "UNTIL":
                    until = parseRRuleDate(kv[1]);
                    break;
            }
        }

        if (freq == null) return -1;
        if (count != null && count < 1) return -1;
        if (until >= 0 && begin > until) return -1;

        if ("WEEKLY".equals(freq) && byDay != null) {
            return getNextWeekdayOccurrence(
                    begin, byDay, rangeStart, rangeEnd, interval, count, until);
        }

        int occurrenceNumber = 0;
        for (int period = 0; period < 1_000_000; period++) {
            long current = occurrenceForPeriod(begin, freq, interval, period);
            if (current == Long.MAX_VALUE || current > rangeEnd) break;
            if (current < 0) continue; // e.g. February 30 in a monthly rule

            occurrenceNumber++;
            if ((count != null && occurrenceNumber > count)
                    || (until >= 0 && current > until)) break;
            if (current >= rangeStart) return current;
        }

        return -1;
    }

    /** Return every recurrence start within [rangeStart, rangeEnd]. */
    static List<Long> getOccurrencesInRange(
            long begin,
            long end,
            String rrule,
            long rangeStart,
            long rangeEnd
    ) {
        List<Long> result = new ArrayList<>();
        long cursor = Math.max(begin, rangeStart);

        // A 48-hour scheduling window should always be small, but retain a
        // hard guard for malformed rules that fail to advance.
        for (int guard = 0; guard < 10_000 && cursor <= rangeEnd; guard++) {
            long occurrence = getNextOccurrenceInRange(
                    begin, end, rrule, cursor, rangeEnd);
            if (occurrence < 0) break;
            result.add(occurrence);
            if (occurrence == Long.MAX_VALUE) break;
            cursor = occurrence + 1;
        }
        return result;
    }

    private static long occurrenceForPeriod(long begin, String freq, int interval, int period) {
        if (interval < 1) return Long.MAX_VALUE;
        Calendar start = Calendar.getInstance();
        start.setTimeInMillis(begin);
        Calendar candidate = (Calendar) start.clone();
        long amount = (long) interval * period;
        if (amount > Integer.MAX_VALUE) return Long.MAX_VALUE;

        switch (freq) {
            case "DAILY":
                candidate.add(Calendar.DAY_OF_MONTH, (int) amount);
                break;
            case "WEEKLY":
                if (amount > Integer.MAX_VALUE / 7L) return Long.MAX_VALUE;
                candidate.add(Calendar.DAY_OF_MONTH, (int) amount * 7);
                break;
            case "MONTHLY": {
                int originalDay = start.get(Calendar.DAY_OF_MONTH);
                candidate.set(Calendar.DAY_OF_MONTH, 1);
                candidate.add(Calendar.MONTH, (int) amount);
                if (originalDay > candidate.getActualMaximum(Calendar.DAY_OF_MONTH)) return -1;
                candidate.set(Calendar.DAY_OF_MONTH, originalDay);
                break;
            }
            case "YEARLY": {
                int originalMonth = start.get(Calendar.MONTH);
                int originalDay = start.get(Calendar.DAY_OF_MONTH);
                candidate.set(Calendar.DAY_OF_MONTH, 1);
                candidate.set(Calendar.MONTH, originalMonth);
                candidate.add(Calendar.YEAR, (int) amount);
                candidate.set(Calendar.MONTH, originalMonth);
                if (originalDay > candidate.getActualMaximum(Calendar.DAY_OF_MONTH)) return -1;
                candidate.set(Calendar.DAY_OF_MONTH, originalDay);
                break;
            }
            default:
                return Long.MAX_VALUE;
        }
        return candidate.getTimeInMillis();
    }

    /**
     * Handle WEEKLY;BYDAY=MO,TU,WE,TH,FR (weekday recurrence).
     * Steps day-by-day from begin, checking if the day matches the BYDAY set.
     */
    private static long getNextWeekdayOccurrence(
            long begin,
            String byDay,
            long rangeStart,
            long rangeEnd,
            int interval,
            Integer count,
            long until
    ) {
        Set<Integer> allowedDays = new HashSet<>();
        for (String day : byDay.split(",")) {
            switch (day.trim()) {
                case "MO": allowedDays.add(Calendar.MONDAY); break;
                case "TU": allowedDays.add(Calendar.TUESDAY); break;
                case "WE": allowedDays.add(Calendar.WEDNESDAY); break;
                case "TH": allowedDays.add(Calendar.THURSDAY); break;
                case "FR": allowedDays.add(Calendar.FRIDAY); break;
                case "SA": allowedDays.add(Calendar.SATURDAY); break;
                case "SU": allowedDays.add(Calendar.SUNDAY); break;
            }
        }

        if (count != null) {
            Calendar cal = Calendar.getInstance();
            cal.setTimeInMillis(begin);
            Calendar recurrenceStart = (Calendar) cal.clone();
            int occurrenceNumber = 0;

            while (cal.getTimeInMillis() <= rangeEnd) {
                long current = cal.getTimeInMillis();
                if (until >= 0 && current > until) {
                    return -1;
                }

                if (allowedDays.contains(cal.get(Calendar.DAY_OF_WEEK))
                        && isActiveWeek(recurrenceStart, cal, interval)
                        && current >= begin) {
                    occurrenceNumber++;
                    if (occurrenceNumber > count) {
                        return -1;
                    }
                    if (current >= rangeStart) {
                        return current;
                    }
                }
                cal.add(Calendar.DAY_OF_MONTH, 1);
            }
            return -1;
        }

        Calendar cal = Calendar.getInstance();
        Calendar beginCal = Calendar.getInstance();
        beginCal.setTimeInMillis(begin);

        if (begin < rangeStart) {
            cal.setTimeInMillis(rangeStart);
            cal.set(Calendar.HOUR_OF_DAY, beginCal.get(Calendar.HOUR_OF_DAY));
            cal.set(Calendar.MINUTE, beginCal.get(Calendar.MINUTE));
            cal.set(Calendar.SECOND, beginCal.get(Calendar.SECOND));
            cal.set(Calendar.MILLISECOND, beginCal.get(Calendar.MILLISECOND));
            if (cal.getTimeInMillis() < rangeStart) {
                cal.add(Calendar.DAY_OF_MONTH, 1);
            }
        } else {
            cal.setTimeInMillis(begin);
        }

        while (cal.getTimeInMillis() <= rangeEnd) {
            long current = cal.getTimeInMillis();
            if (until >= 0 && current > until) {
                return -1;
            }
            if (allowedDays.contains(cal.get(Calendar.DAY_OF_WEEK))
                    && isActiveWeek(beginCal, cal, interval)
                    && current >= rangeStart) {
                return current;
            }
            cal.add(Calendar.DAY_OF_MONTH, 1);
        }

        return -1;
    }

    private static boolean isActiveWeek(Calendar begin, Calendar current, int interval) {
        if (interval <= 1) return true;
        Calendar beginWeek = startOfWeek(begin);
        Calendar currentWeek = startOfWeek(current);
        long weekMillis = 7L * 24 * 60 * 60 * 1000;
        long weeks = Math.round(
                (currentWeek.getTimeInMillis() - beginWeek.getTimeInMillis())
                        / (double) weekMillis);
        return weeks >= 0 && weeks % interval == 0;
    }

    private static Calendar startOfWeek(Calendar source) {
        Calendar result = (Calendar) source.clone();
        int day = result.get(Calendar.DAY_OF_WEEK);
        int daysSinceMonday = (day - Calendar.MONDAY + 7) % 7;
        result.add(Calendar.DAY_OF_MONTH, -daysSinceMonday);
        result.set(Calendar.HOUR_OF_DAY, 12);
        result.set(Calendar.MINUTE, 0);
        result.set(Calendar.SECOND, 0);
        result.set(Calendar.MILLISECOND, 0);
        return result;
    }

    private static long parseRRuleDate(String value) {
        String clean = value.trim().toUpperCase();

        try {
            if (clean.matches("\\d{8}T\\d{6}Z")) {
                Calendar cal = Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"));
                cal.set(Calendar.YEAR, Integer.parseInt(clean.substring(0, 4)));
                cal.set(Calendar.MONTH, Integer.parseInt(clean.substring(4, 6)) - 1);
                cal.set(Calendar.DAY_OF_MONTH, Integer.parseInt(clean.substring(6, 8)));
                cal.set(Calendar.HOUR_OF_DAY, Integer.parseInt(clean.substring(9, 11)));
                cal.set(Calendar.MINUTE, Integer.parseInt(clean.substring(11, 13)));
                cal.set(Calendar.SECOND, Integer.parseInt(clean.substring(13, 15)));
                cal.set(Calendar.MILLISECOND, 0);
                return cal.getTimeInMillis();
            }

            if (clean.matches("\\d{8}T\\d{6}")) {
                Calendar cal = Calendar.getInstance();
                cal.set(Calendar.YEAR, Integer.parseInt(clean.substring(0, 4)));
                cal.set(Calendar.MONTH, Integer.parseInt(clean.substring(4, 6)) - 1);
                cal.set(Calendar.DAY_OF_MONTH, Integer.parseInt(clean.substring(6, 8)));
                cal.set(Calendar.HOUR_OF_DAY, Integer.parseInt(clean.substring(9, 11)));
                cal.set(Calendar.MINUTE, Integer.parseInt(clean.substring(11, 13)));
                cal.set(Calendar.SECOND, Integer.parseInt(clean.substring(13, 15)));
                cal.set(Calendar.MILLISECOND, 0);
                return cal.getTimeInMillis();
            }

            if (clean.matches("\\d{8}")) {
                Calendar cal = Calendar.getInstance();
                cal.set(Calendar.YEAR, Integer.parseInt(clean.substring(0, 4)));
                cal.set(Calendar.MONTH, Integer.parseInt(clean.substring(4, 6)) - 1);
                cal.set(Calendar.DAY_OF_MONTH, Integer.parseInt(clean.substring(6, 8)));
                cal.set(Calendar.HOUR_OF_DAY, 23);
                cal.set(Calendar.MINUTE, 59);
                cal.set(Calendar.SECOND, 59);
                cal.set(Calendar.MILLISECOND, 999);
                return cal.getTimeInMillis();
            }
        } catch (NumberFormatException ignored) {
            return -1;
        }

        return -1;
    }
}
