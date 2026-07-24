import { Box, Divider, styled } from "@mui/material";
import dayjs from "dayjs";
import { useEffect, useRef, useState } from "react";

const Dot = styled("div")`
  width: 4px;
  height: 4px;
  background: red;
  border-radius: 100%;
`;

export const TimeMarker = ({
  offset = "0px",
  isCurrent = false,
}: {
  offset?: string;
  isCurrent?: boolean;
}) => {
  const getCurrentTimeInHour = () => dayjs().hour() + dayjs().minute() / 60;

  const [currentTimeInHour, updateCurrentTimeInHour] =
    useState(getCurrentTimeInHour);
  const intervalId = useRef<number | null>(null);

  useEffect(() => {
    if (intervalId.current) {
      clearInterval(intervalId.current);
    }
    intervalId.current = setInterval(() => {
      updateCurrentTimeInHour(getCurrentTimeInHour);
    }, 1000);
    return () => {
      if (intervalId.current) {
        clearInterval(intervalId.current);
      }
    };
  }, []);

  return (
    <Box
      data-current-time-marker={isCurrent ? "true" : undefined}
      sx={{
        // height of each hour block is 60px
        top: `calc(${offset} + 60 * ${currentTimeInHour}px)`,
        "--fc-time-marker-color": "red",
        "--mui-palette-divider": "var(--fc-time-marker-color)",
        width: "100%",
        position: "absolute",
        height: "4px",
        display: "flex",
        alignItems: "center",
      }}
    >
      <Dot />
      <Divider
        sx={{
          width: "calc(100% - 4px)",
        }}
      />
    </Box>
  );
};
