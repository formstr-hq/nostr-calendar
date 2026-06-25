import { useMediaQuery, Box, useTheme } from "@mui/material";
import { MotionNodeDragHandlers, AnimatePresence, motion } from "framer-motion";
import React, { useRef } from "react";
import { useDateWithRouting } from "../hooks/useDateWithRouting";
import { Dayjs } from "dayjs";
import { ICalendarEvent } from "../utils/types";
import { useLayout } from "../hooks/useLayout";

const SWIPE_THRESHOLD = 50;

export interface ViewProps {
  events: ICalendarEvent[];
  date: Dayjs;
}

interface SwipeableViewProps {
  events: ICalendarEvent[];
  View: React.FC<ViewProps>;
}

const variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? "100%" : "-100%",
  }),
  center: {
    x: 0,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? "-100%" : "100%",
  }),
};

export function SwipeableView({ events, View }: SwipeableViewProps) {
  const { date, setDate } = useDateWithRouting();
  const { layout } = useLayout();
  const directionRef = useRef(0);
  const isSwiping = useRef(false);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  if (!isMobile) {
    return <View events={events} date={date} />;
  }

  const handleDragEnd: MotionNodeDragHandlers["onDragEnd"] = (_, info) => {
    if (isSwiping.current) return;
    if (info.offset.x < -SWIPE_THRESHOLD) {
      isSwiping.current = true;
      directionRef.current = 1;
      setDate(date.add(1, layout), layout);
    } else if (info.offset.x > SWIPE_THRESHOLD) {
      isSwiping.current = true;
      directionRef.current = -1;
      setDate(date.subtract(1, layout), layout);
    }
  };

  const dateKey = date.format("YYYY-MM-DD");
  const direction = directionRef.current;
  isSwiping.current = false;

  return (
    <Box overflow="hidden" width="100%" position="relative">
      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.div
          key={dateKey}
          custom={direction}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.3}
          onDragEnd={handleDragEnd}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            type: "tween",
            duration: 0.25,
            ease: "easeOut",
          }}
          style={{ width: "100%" }}
        >
          <View events={events} date={date} />
        </motion.div>
      </AnimatePresence>
    </Box>
  );
}
