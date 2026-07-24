import { useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { SectionLabel } from "./ui/SectionLabel";
import { SegmentedControl } from "./ui/SegmentedControl";
import { EventChip } from "./ui/EventChip";
import { AvatarStack } from "./ui/AvatarStack";
import { RelayStatusDots } from "./ui/RelayStatusDots";
import { BottomSheet } from "./ui/BottomSheet";
import { MiniCalendar } from "./ui/MiniCalendar";
import dayjs from "dayjs";

/** Dev-only showcase of the ui/ primitives, eyeballed in light/dark. Not routed in production. */
export function DevUiShowcase() {
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [date, setDate] = useState(dayjs());
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <Box
      sx={{
        p: 4,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        maxWidth: 480,
      }}
    >
      <Typography variant="h5">/dev/ui — primitive showcase</Typography>

      <Stack gap={1}>
        <SectionLabel>Section label</SectionLabel>
      </Stack>

      <Stack gap={1}>
        <Typography variant="body2">Segmented control</Typography>
        <SegmentedControl
          aria-label="demo view"
          options={[
            { value: "month", label: "Month" },
            { value: "week", label: "Week" },
            { value: "day", label: "Day" },
          ]}
          value={view}
          onChange={setView}
        />
      </Stack>

      <Stack direction="row" gap={1}>
        <EventChip title="Team sync" color="#3b82f6" />
        <EventChip title="Public talk" color="#8b5cf6" isPublic />
      </Stack>

      <AvatarStack
        items={[{ name: "Ada Lovelace" }, { name: "Rex" }, { name: "B" }]}
      />

      <RelayStatusDots
        relays={[
          { url: "wss://a", status: "ok" },
          { url: "wss://b", status: "ok" },
          { url: "wss://c", status: "pending" },
        ]}
      />

      <Box
        component="button"
        type="button"
        onClick={() => setSheetOpen(true)}
        sx={{ p: 1 }}
      >
        Open BottomSheet
      </Box>
      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <Box sx={{ p: 2 }}>Bottom sheet content</Box>
      </BottomSheet>

      <MiniCalendar date={date} weekStart="monday" onSelect={setDate} />
    </Box>
  );
}
