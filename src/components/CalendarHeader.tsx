import React from "react";
import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import TodayIcon from "@mui/icons-material/Today";
import KeyboardArrowDown from "@mui/icons-material/KeyboardArrowDown";
import NotificationsIcon from "@mui/icons-material/Notifications";
import {
  Box,
  IconButton,
  Typography,
  Menu,
  MenuItem,
  Button,
  Badge,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import { useLayout } from "../hooks/useLayout";
import dayjs from "dayjs";
import { getRouteFromDate } from "../utils/dateBasedRouting";
import { useNavigate } from "react-router";
import { useDateWithRouting } from "../hooks/useDateWithRouting";
import { StyledSecondaryHeader } from "./StyledComponents";
import { WeekHeader } from "./WeekView";
import { useInvitations } from "../stores/invitations";
import { useIntl } from "react-intl";

export function CalendarHeader() {
  const intl = useIntl();
  const { layout, updateLayout } = useLayout();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const theme = useTheme();
  const navigate = useNavigate();
  const { date, setDate } = useDateWithRouting();
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const move = (dir: number) => setDate(date.add(dir, layout), layout);

  const { unreadCount } = useInvitations();

  return (
    <>
      <StyledSecondaryHeader
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        position={"sticky"}
        paddingBottom={2}
      >
        <Box display="flex" alignItems="center">
          {!isMobile && (
            <>
              <IconButton onClick={() => move(-1)}>
                <ChevronLeft />
              </IconButton>
              <IconButton onClick={() => move(1)}>
                <ChevronRight />
              </IconButton>
            </>
          )}
          <Typography ml={2} fontWeight={600}>
            {layout === "month" && date.format("MMMM YYYY")}
            {layout === "week" && (
              <>
                {date.startOf("week").format("DD")}-
                {date.endOf("week").format("DD")} {date.format("MMM YY")}
              </>
            )}
            {layout === "day" && date.format("MMM D, YYYY")}
          </Typography>
        </Box>
        <Box display="flex" gap={theme.spacing(2)} alignItems="center">
          {/* Notification bell for pending invitations */}
          <IconButton
            onClick={() => {
              if (isMobile) {
                navigate("/notifications");
              } else {
                navigate("/notifications");
              }
            }}
          >
            <Badge badgeContent={unreadCount} color="error">
              <NotificationsIcon />
            </Badge>
          </IconButton>
          <IconButton
            onClick={() => {
              const route = getRouteFromDate(dayjs(), layout);
              if (route !== location.pathname) {
                navigate(route);
              }
            }}
          >
            <TodayIcon />
          </IconButton>
          <Button
            onClick={handleClick}
            variant="outlined"
            startIcon={<KeyboardArrowDown />}
          >
            {intl.formatMessage({ id: `navigation.${layout}` })}
          </Button>
          <Menu anchorEl={anchorEl} open={open} onClose={handleClose}>
            <MenuItem
              selected={layout === "day"}
              disabled={layout === "day"}
              onClick={() => {
                updateLayout("day");
                handleClose();
              }}
            >
              {intl.formatMessage({ id: "navigation.day" })}
            </MenuItem>
            <MenuItem
              selected={layout === "week"}
              disabled={layout === "week"}
              onClick={() => {
                updateLayout("week");
                handleClose();
              }}
            >
              {intl.formatMessage({ id: "navigation.week" })}
            </MenuItem>
            <MenuItem
              selected={layout === "month"}
              disabled={layout === "month"}
              onClick={() => {
                updateLayout("month");
                handleClose();
              }}
            >
              {intl.formatMessage({ id: "navigation.month" })}
            </MenuItem>
          </Menu>
        </Box>
      </StyledSecondaryHeader>
      {layout === "week" && <WeekHeader date={date} />}
    </>
  );
}
