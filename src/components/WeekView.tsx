import {
  Box,
  Divider,
  Typography,
  useColorScheme,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import dayjs, { Dayjs } from "dayjs";
import weekday from "dayjs/plugin/weekday";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import { DndContext } from "@dnd-kit/core";
import {
  getEventSegmentsForDay,
  getTimeFromCell,
  layoutDayEvents,
} from "../common/calendarEngine";
import { AllDayEventChip, CalendarEventCard } from "./CalendarEvent";
import { DateLabel } from "./DateLabel";
import { isWeekend } from "../utils/dateHelper";
import { lightTokens, darkTokens } from "../theme/tokens";
import { StyledSecondaryHeader } from "./StyledComponents";
import { MOBILE_TOPBAR_ROW2_HEIGHT } from "./ui/TopBar";
import { TimeMarker } from "./TimeMarker";
import { useRef, useState } from "react";
import CalendarEventEdit from "./CalendarEventEdit";
import { ViewProps } from "./SwipeableView";
import { useIntl } from "react-intl";

dayjs.extend(weekday);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

export const WeekHeader = ({ date }: { date: Dayjs }) => {
  const start = date.startOf("week");
  const days = Array.from({ length: 7 }, (_, i) => start.add(i, "day"));
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  return (
    <StyledSecondaryHeader
      zIndex={1}
      topOffset={isMobile ? MOBILE_TOPBAR_ROW2_HEIGHT : 0}
      textAlign="center"
      display="grid"
      gridTemplateColumns="repeat(7, 1fr)"
      flexDirection={"row"}
      alignItems={"center"}
      paddingY={theme.spacing(1)}
      paddingLeft={"60px"}
    >
      {days.map((day) => (
        <Box
          display={"flex"}
          key={day.format("YYYY-MMM-ddd")}
          flexDirection={"column"}
          alignItems={"center"}
        >
          <Typography variant="body1" fontWeight={600}>
            {day.format("ddd")}
          </Typography>
          <DateLabel day={day}></DateLabel>
        </Box>
      ))}
    </StyledSecondaryHeader>
  );
};

export function WeekView({ events, date }: ViewProps) {
  const intl = useIntl();
  const start = date.startOf("week");

  const days = Array.from({ length: 7 }, (_, i) => start.add(i, "day"));

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [clickedDateTime, setClickedDateTime] = useState<number | undefined>();

  const handleCellClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const time = getTimeFromCell(event, containerRef);
    if (time) {
      setClickedDateTime(time);
    }
    setDialogOpen(true);
  };

  const { mode, systemMode } = useColorScheme();
  const resolvedMode = mode === "system" ? systemMode : mode;
  const weekendBg =
    resolvedMode === "dark" ? darkTokens.otherMonthBg : lightTokens.otherMonthBg;

  const DAY_MS = 24 * 60 * 60 * 1000;
  const allDayForDay = (dayStartMs: number) =>
    events.filter(
      (e) => e.allDay && e.begin < dayStartMs + DAY_MS && e.end > dayStartMs,
    );
  const timedEvents = events.filter((e) => !e.allDay);

  const hasAnyAllDay = days.some(
    (day) => allDayForDay(day.startOf("day").valueOf()).length > 0,
  );

  return (
    <>
      {hasAnyAllDay && (
        <Box
          display="flex"
          sx={{
            borderBottom: "1px solid",
            borderColor: "divider",
            minHeight: 24,
          }}
        >
          <Box
            width={60}
            borderRight="1px solid"
            sx={{ borderColor: "divider" }}
            display="flex"
            alignItems="center"
            justifyContent="center"
            flexShrink={0}
          >
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {intl.formatMessage({ id: "event.allDayLabel" })}
            </Typography>
          </Box>
          <Box
            flex={1}
            minWidth={0}
            display="grid"
            gridTemplateColumns="repeat(7, 1fr)"
          >
            {days.map((day) => (
              <Box
                key={day.toString()}
                p={0.5}
                borderLeft="1px solid"
                sx={{ borderColor: "divider", minWidth: 0, overflow: "hidden" }}
              >
                {allDayForDay(day.startOf("day").valueOf()).map((evt) => (
                  <AllDayEventChip key={`${evt.id}:${evt.begin}`} event={evt} />
                ))}
              </Box>
            ))}
          </Box>
        </Box>
      )}
      <DndContext>
        <Box display="flex" height={24 * 60}>
          {/* Time column */}
          <Box width={60} position={"relative"}>
            <TimeMarker />
            {Array.from({ length: 24 }).map((_, h) => (
              <Box key={h} height={60} px={0.5}>
                <Typography variant="caption">{h}:00</Typography>
              </Box>
            ))}
          </Box>

          {/* Days */}
          <Box
            flex={1}
            minWidth={0}
            display="grid"
            gridTemplateColumns="repeat(7, 1fr)"
          >
            {days.map((day) => {
              const laidOut = layoutDayEvents(
                getEventSegmentsForDay(
                  timedEvents,
                  day.startOf("day").valueOf(),
                ),
              );

              return (
                <Box
                  key={day.toString()}
                  position="relative"
                  borderLeft="1px solid"
                  ref={containerRef}
                  sx={{
                    borderColor: "divider",
                    cursor: "pointer",
                    minWidth: 0,
                    overflow: "hidden",
                    background: isWeekend(day) ? weekendBg : "transparent",
                  }}
                >
                  {/* Day header */}

                  {day.isSame(dayjs(), "day") && <TimeMarker />}
                  {Array.from({ length: 24 }).map((_, h) => (
                    <Box
                      onClick={handleCellClick}
                      data-date={day.format("YYYY-MM-DD")}
                      data-testid="day-hour-cell"
                      key={h}
                      height={60}
                      px={0.5}
                    >
                      <Divider />
                    </Box>
                  ))}
                  {laidOut.map((e) => (
                    <CalendarEventCard key={e.renderKey} event={e} />
                  ))}
                </Box>
              );
            })}
          </Box>
        </Box>
        {dialogOpen && (
          <CalendarEventEdit
            open={dialogOpen}
            event={null}
            initialDateTime={clickedDateTime}
            onClose={() => setDialogOpen(false)}
            mode="create"
          />
        )}
      </DndContext>
    </>
  );
}
