import { IconButton, Typography } from "@mui/material";
import dayjs, { Dayjs } from "dayjs";
import { useNavigate } from "react-router";
import { getRouteFromDate } from "../utils/dateBasedRouting";
import React from "react";

const today = dayjs();

const defaultSize = 36;

export function DateLabel({
  day,
  size = defaultSize,
}: {
  day: Dayjs;
  size?: number;
}) {
  const isToday = today.isSame(day, "date");
  const navigate = useNavigate();
  const fontSize = size / defaultSize;
  const onDateClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    navigate(getRouteFromDate(day, "day"));
    e.stopPropagation();
  };
  return (
    <IconButton
      variant={isToday ? "highlighted" : undefined}
      color="primary"
      size="small"
      onClick={onDateClick}
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      <Typography fontSize={`${fontSize}rem`} variant="body1" fontWeight={600}>
        {day.date()}
      </Typography>
    </IconButton>
  );
}
