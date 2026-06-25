package app.formstr.calendar;

import java.util.Calendar;
import java.util.HashSet;
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
            return getNextWeekdayOccurrence(begin, byDay, rangeStart, rangeEnd, count, until);
        }

        long current = begin;
        int occurrenceNumber = 1;
        while (current <= rangeEnd) {
            if ((count != null && occurrenceNumber > count)
                    || (until >= 0 && current > until)) {
                break;
            }
            if (current >= rangeStart && current <= rangeEnd) {
                return current;
            }
            current = advanceByFrequency(current, freq, interval);
            occurrenceNumber++;
            if (current <= begin) break; // overflow protection
        }

        return -1;
    }

    private static long advanceByFrequency(long timestamp, String freq, int interval) {
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(timestamp);

        switch (freq) {
            case "DAILY":
                cal.add(Calendar.DAY_OF_MONTH, interval);
                break;
            case "WEEKLY":
                cal.add(Calendar.WEEK_OF_YEAR, interval);
                break;
            case "MONTHLY":
                cal.add(Calendar.MONTH, interval);
                break;
            case "YEARLY":
                cal.add(Calendar.YEAR, interval);
                break;
            default:
                return Long.MAX_VALUE;
        }

        return cal.getTimeInMillis();
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
            int occurrenceNumber = 0;

            while (cal.getTimeInMillis() <= rangeEnd) {
                long current = cal.getTimeInMillis();
                if (until >= 0 && current > until) {
                    return -1;
                }

                if (allowedDays.contains(cal.get(Calendar.DAY_OF_WEEK))
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
                    && current >= rangeStart) {
                return current;
            }
            cal.add(Calendar.DAY_OF_MONTH, 1);
        }

        return -1;
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
        } catch (NumberFormatException ignored) {
            return -1;
        }

        return -1;
    }
}
