import { forwardRef, ReactNode } from "react";
import {
  Badge,
  Box,
  IconButton,
  InputBase,
  Link,
  Typography,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import NotificationsIcon from "@mui/icons-material/Notifications";
import SearchIcon from "@mui/icons-material/Search";
import CalendarViewMonthIcon from "@mui/icons-material/CalendarViewMonth";
import { SegmentedControl } from "./SegmentedControl";
import { RelayStatusDots, RelayStatusEntry } from "./RelayStatusDots";
import type { Layout } from "../../hooks/useLayout";

export const TOPBAR_HEIGHT = 64;
/** Height of the mobile-only second row (view switcher + Today) below the main bar. */
export const MOBILE_TOPBAR_ROW2_HEIGHT = 48;

const VIEW_OPTIONS: { value: Layout; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
];

interface TopBarProps {
  isMobile: boolean;
  /** "calendar" shows prev/next/date/view-switcher/today; "title" shows a plain page title. */
  mode: "calendar" | "title";
  title?: string;
  dateLabel?: string;
  view?: Layout;
  onViewChange?: (view: Layout) => void;
  onPrev?: () => void;
  onNext?: () => void;
  onToday?: () => void;
  unreadCount: number;
  onBellClick: () => void;
  onOpenCalendars?: () => void;
  relays: RelayStatusEntry[];
  avatarSlot: ReactNode;
}

export const TopBar = forwardRef<HTMLInputElement, TopBarProps>(function TopBar(
  {
    isMobile,
    mode,
    title,
    dateLabel,
    view,
    onViewChange,
    onPrev,
    onNext,
    onToday,
    unreadCount,
    onBellClick,
    onOpenCalendars,
    relays,
    avatarSlot,
  },
  searchInputRef,
) {
  const viewSwitcher = mode === "calendar" && view && onViewChange && (
    <SegmentedControl
      aria-label="Calendar view"
      options={VIEW_OPTIONS}
      value={view}
      onChange={onViewChange}
    />
  );

  const todayButton = mode === "calendar" && onToday && (
    <Box
      component="button"
      type="button"
      aria-label="go to today"
      onClick={onToday}
      sx={{
        border: "1.5px solid",
        borderColor: "divider",
        bgcolor: "transparent",
        borderRadius: 5,
        px: 1.5,
        height: 34,
        fontSize: 13,
        fontWeight: 700,
        fontFamily: "inherit",
        cursor: "pointer",
        color: "text.primary",
        flexShrink: 0,
      }}
    >
      Today
    </Box>
  );

  return (
    <Box
      sx={{
        position: "sticky",
        top: 0,
        zIndex: (theme) => theme.zIndex.appBar,
        bgcolor: "background.paper",
        borderBottom: "1px solid",
        borderColor: "divider",
        pt: "var(--safe-area-top)",
      }}
    >
      <Box
        sx={{
          height: TOPBAR_HEIGHT,
          display: "flex",
          alignItems: "center",
          gap: 2,
          px: isMobile ? 1.5 : 2.5,
        }}
      >
        <Link
          href="/"
          underline="none"
          sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}
        >
          <img
            src="/formstr.png"
            alt="Formstr Calendar"
            style={{ height: 28, width: "auto" }}
          />
          {!isMobile && (
            <Typography sx={{ fontWeight: 800, fontSize: 15 }}>
              Formstr Calendar
            </Typography>
          )}
        </Link>

        {isMobile && onOpenCalendars && (
          <IconButton
            aria-label="Open calendars"
            onClick={onOpenCalendars}
            size="small"
          >
            <CalendarViewMonthIcon fontSize="small" />
          </IconButton>
        )}

        {mode === "calendar" ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            {!isMobile && (
              <>
                <IconButton aria-label="previous period" onClick={onPrev}>
                  <ChevronLeftIcon />
                </IconButton>
                <IconButton aria-label="next period" onClick={onNext}>
                  <ChevronRightIcon />
                </IconButton>
              </>
            )}
            <Typography
              data-testid="topbar-date-label"
              sx={{ fontWeight: 800, fontSize: isMobile ? 15 : 20 }}
            >
              {dateLabel}
            </Typography>
          </Box>
        ) : (
          <Typography sx={{ fontWeight: 800, fontSize: isMobile ? 15 : 20 }}>
            {title}
          </Typography>
        )}

        <Box sx={{ flex: 1 }} />

        {!isMobile && (
          <InputBase
            inputRef={searchInputRef}
            placeholder="Search    ⌘K"
            startAdornment={
              <SearchIcon
                sx={{ fontSize: 18, mr: 0.75, color: "text.disabled" }}
              />
            }
            sx={{
              width: 204,
              height: 34,
              px: 1.25,
              fontSize: 13,
              borderRadius: 2.5,
              border: "1.5px solid",
              borderColor: "divider",
            }}
          />
        )}

        {!isMobile && viewSwitcher}
        {!isMobile && todayButton}

        <IconButton
          aria-label="Notifications"
          onClick={onBellClick}
          size="small"
        >
          <Badge badgeContent={unreadCount} color="error">
            <NotificationsIcon fontSize="small" />
          </Badge>
        </IconButton>

        {!isMobile && <RelayStatusDots relays={relays} />}

        {avatarSlot}
      </Box>

      {isMobile && (viewSwitcher || todayButton) && (
        <Box
          sx={{
            height: MOBILE_TOPBAR_ROW2_HEIGHT,
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 1.5,
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          {viewSwitcher}
          {todayButton}
        </Box>
      )}
    </Box>
  );
});
