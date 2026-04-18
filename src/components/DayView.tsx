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
import { CalendarEventCard } from "./CalendarEvent";
import { DndContext } from "@dnd-kit/core";
import { TimeMarker } from "./TimeMarker";
import { useRef, useState } from "react";
import CalendarEventEdit from "./CalendarEventEdit";
import { ViewProps } from "./SwipeableView";

dayjs.extend(weekday);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

export function DayView({ events, date }: ViewProps) {
  const dayStart = date.startOf("day").valueOf();
  const dayEvents = layoutDayEvents(getEventSegmentsForDay(events, dayStart));
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
