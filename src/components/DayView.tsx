import { Box, Divider, Typography } from "@mui/material";
import dayjs from "dayjs";
import weekday from "dayjs/plugin/weekday";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import {
  getEventSegmentsForDay,
  getTimeFromCell,
  layoutDayEvents,
} from "../common/calendarEngine";
import { AllDayEventChip, CalendarEventCard } from "./CalendarEvent";
import { DndContext } from "@dnd-kit/core";
import { TimeMarker } from "./TimeMarker";
import { useRef, useState } from "react";
import CalendarEventEdit from "./CalendarEventEdit";
import { ViewProps } from "./SwipeableView";
import { useIntl } from "react-intl";

dayjs.extend(weekday);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

export function DayView({ events, date }: ViewProps) {
  const intl = useIntl();
  const dayStart = date.startOf("day").valueOf();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const allDayEvents = events.filter(
    (e) => e.allDay && e.begin < dayEnd && e.end > dayStart,
  );
  const timedEvents = events.filter((e) => !e.allDay);
  const dayEvents = layoutDayEvents(
    getEventSegmentsForDay(timedEvents, dayStart),
  );
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

  return (
    <>
      {allDayEvents.length > 0 && (
        <Box
          display="flex"
          sx={{ borderBottom: "1px solid #ddd", minHeight: 24 }}
        >
          <Box
            width={60}
            borderRight="1px solid #ddd"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {intl.formatMessage({ id: "event.allDayLabel" })}
            </Typography>
          </Box>
          <Box flex={1} p={0.5}>
            {allDayEvents.map((evt) => (
              <AllDayEventChip key={`${evt.id}:${evt.begin}`} event={evt} />
            ))}
          </Box>
        </Box>
      )}
      <DndContext>
        <Box display="flex" height={24 * 60}>
          {/* Time column */}
          <Box width={60} borderRight="1px solid #ddd">
            {Array.from({ length: 24 }).map((_, h) => (
              <Box key={h} height={60} px={0.5}>
                <Typography variant="caption">{h}:00</Typography>
              </Box>
            ))}
          </Box>

          {/* Events */}
          <Box flex={1} position="relative" ref={containerRef}>
            <TimeMarker offset="0px" />
            {/* Hour Divider */}
            <Box display={"flex"} flexDirection={"column"}>
              {Array.from({ length: 24 }).map((_, h) => (
                <Box
                  data-date={date.format("YYYY-MM-DD")}
                  onClick={handleCellClick}
                  key={h}
                  height={60}
                  px={0.5}
                  sx={{
                    cursor: "pointer",
                  }}
                >
                  <Divider />
                </Box>
              ))}
            </Box>
            {dayEvents.map((e) => (
              <CalendarEventCard key={e.renderKey} event={e} />
            ))}
          </Box>
        </Box>
      </DndContext>
      {dialogOpen && (
        <CalendarEventEdit
          open={dialogOpen}
          event={null}
          initialDateTime={clickedDateTime}
          onClose={() => setDialogOpen(false)}
          mode="create"
        />
      )}
    </>
  );
}
