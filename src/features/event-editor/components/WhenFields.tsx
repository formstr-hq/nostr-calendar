import { Box, Switch, Typography } from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import type { Dayjs } from "dayjs";
import { useIntl } from "react-intl";
import type { SelectChangeEvent } from "@mui/material";
import { RepeatingFrequency } from "../../../utils/types";
import type { RecurrenceEndMode } from "../../../utils/repeatingEventsHelper";
import {
  RecurrenceSelector,
  CUSTOM_RECURRENCE_VALUE,
} from "../../../components/RecurrenceSelector";
import { EventPrivacySettings } from "../../../components/EventPrivacySettings";
import { SectionLabel } from "../../../components/ui/SectionLabel";
import {
  AdvancedBox,
  AdvRow,
  GroupCard,
  GroupRow,
  CollapseToggle,
  sectionLabelSx,
} from "./styled";

const compactFieldSx = {
  "& .MuiInput-root:before, & .MuiInput-root:after": { display: "none" },
  "& .MuiInputBase-input": {
    textAlign: "right" as const,
    fontSize: 14,
    padding: 0,
  },
};

interface WhenFieldsProps {
  variant: "desktop" | "mobile";
  allDay: boolean;
  onToggleAllDay: (checked: boolean) => void;
  beginDate: Dayjs;
  beginTime: Dayjs;
  endDate: Dayjs;
  endTime: Dayjs;
  onBeginDateChange: (date: Dayjs | null) => void;
  onBeginTimeChange: (time: Dayjs | null) => void;
  onEndDateChange: (date: Dayjs | null) => void;
  onEndTimeChange: (time: Dayjs | null) => void;
  recurrenceSelectValue: RepeatingFrequency | typeof CUSTOM_RECURRENCE_VALUE;
  isCustomRecurrence: boolean;
  customRule: string | null;
  recurrenceEndMode: RecurrenceEndMode;
  recurrenceCount: number;
  recurrenceUntilDate: Dayjs | null;
  eventStart: number;
  onFrequencyChange: (event: SelectChangeEvent<string>) => void;
  onEndModeChange: (event: SelectChangeEvent<string>) => void;
  onCountChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onUntilDateChange: (date: Dayjs | null) => void;
  onEditCustom: () => void;
  moreOpen: boolean;
  onToggleMore: () => void;
  publishBusy: boolean;
  supportsBusyListPublish: boolean;
  onPublishBusyChange: (value: boolean) => void;
  /** Desktop only: rendered next to the Repeat pill (the Calendar pill). */
  calendarSlot?: React.ReactNode;
}

export function WhenFields(props: WhenFieldsProps) {
  const {
    variant,
    allDay,
    onToggleAllDay,
    beginDate,
    beginTime,
    endDate,
    endTime,
    onBeginDateChange,
    onBeginTimeChange,
    onEndDateChange,
    onEndTimeChange,
    moreOpen,
    onToggleMore,
    publishBusy,
    supportsBusyListPublish,
    onPublishBusyChange,
    calendarSlot,
  } = props;
  const intl = useIntl();

  const recurrenceTrigger = (
    <RecurrenceSelector
      section="trigger"
      value={props.recurrenceSelectValue}
      isCustomRecurrence={props.isCustomRecurrence}
      customRule={props.customRule}
      endMode={props.recurrenceEndMode}
      count={props.recurrenceCount}
      untilDate={props.recurrenceUntilDate}
      eventStart={props.eventStart}
      onFrequencyChange={props.onFrequencyChange}
      onEndModeChange={props.onEndModeChange}
      onCountChange={props.onCountChange}
      onUntilDateChange={props.onUntilDateChange}
      onEditCustom={props.onEditCustom}
    />
  );

  const recurrenceDetails = (
    <RecurrenceSelector
      section="details"
      value={props.recurrenceSelectValue}
      isCustomRecurrence={props.isCustomRecurrence}
      customRule={props.customRule}
      endMode={props.recurrenceEndMode}
      count={props.recurrenceCount}
      untilDate={props.recurrenceUntilDate}
      eventStart={props.eventStart}
      onFrequencyChange={props.onFrequencyChange}
      onEndModeChange={props.onEndModeChange}
      onCountChange={props.onCountChange}
      onUntilDateChange={props.onUntilDateChange}
      onEditCustom={props.onEditCustom}
    />
  );

  const busyFreeControl = supportsBusyListPublish ? (
    <EventPrivacySettings
      publishBusy={publishBusy}
      supportsBusyListPublish={supportsBusyListPublish}
      onPublishBusyChange={onPublishBusyChange}
    />
  ) : null;

  if (variant === "mobile") {
    return (
      <GroupCard>
        <GroupRow first>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {intl.formatMessage({ id: "event.dateLabel" })}
          </Typography>
          <DatePicker
            value={beginDate}
            onChange={onBeginDateChange}
            format="ddd, MMM D"
            slotProps={{
              textField: {
                variant: "standard",
                size: "small",
                sx: compactFieldSx,
              },
            }}
          />
        </GroupRow>
        {!allDay && (
          <>
            <GroupRow>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {intl.formatMessage({ id: "event.startsLabel" })}
              </Typography>
              <TimePicker
                value={beginTime}
                onChange={onBeginTimeChange}
                slotProps={{
                  textField: {
                    variant: "standard",
                    size: "small",
                    sx: compactFieldSx,
                    inputProps: {
                      "data-testid": "event-start-time",
                      "aria-label": "event start time",
                    },
                  },
                }}
              />
            </GroupRow>
            <GroupRow>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {intl.formatMessage({ id: "event.endsLabel" })}
              </Typography>
              <TimePicker
                value={endTime}
                onChange={onEndTimeChange}
                slotProps={{
                  textField: {
                    variant: "standard",
                    size: "small",
                    sx: compactFieldSx,
                  },
                }}
              />
            </GroupRow>
          </>
        )}
        <GroupRow>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {intl.formatMessage({ id: "event.endsOnLabel" })}
          </Typography>
          <DatePicker
            value={endDate}
            onChange={onEndDateChange}
            format="ddd, MMM D"
            minDate={beginDate}
            slotProps={{
              textField: {
                variant: "standard",
                size: "small",
                sx: compactFieldSx,
              },
            }}
          />
        </GroupRow>
        <GroupRow>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {intl.formatMessage({ id: "event.repeatLabel" })}
          </Typography>
          {recurrenceTrigger}
        </GroupRow>
        <GroupRow sx={{ p: 0 }}>
          <CollapseToggle
            onClick={onToggleMore}
            fullWidth
            sx={{ px: 2, py: 1.5 }}
          >
            {moreOpen ? "▾" : "▸"}{" "}
            {intl.formatMessage({ id: "event.moreOptions" })}
          </CollapseToggle>
        </GroupRow>
        {moreOpen && (
          <>
            <GroupRow>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {intl.formatMessage({ id: "event.allDay" })}
              </Typography>
              <Switch
                checked={allDay}
                onChange={(e) => onToggleAllDay(e.target.checked)}
              />
            </GroupRow>
            {recurrenceDetails}
            {busyFreeControl}
          </>
        )}
      </GroupCard>
    );
  }

  return (
    <Box sx={{ mb: 3 }}>
      <SectionLabel sx={sectionLabelSx}>
        {intl.formatMessage({ id: "event.when" })}
      </SectionLabel>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          flexWrap: "wrap",
          mb: 1.5,
        }}
      >
        <DatePicker
          value={beginDate}
          onChange={onBeginDateChange}
          format="ddd, MMM D"
          slotProps={{ textField: { size: "small", sx: { width: 150 } } }}
        />
        {!allDay && (
          <>
            <TimePicker
              value={beginTime}
              onChange={onBeginTimeChange}
              slotProps={{
                textField: {
                  size: "small",
                  sx: { width: 110 },
                  inputProps: {
                    "data-testid": "event-start-time",
                    "aria-label": "event start time",
                  },
                },
              }}
            />
            <Typography color="text.disabled">→</Typography>
            <TimePicker
              value={endTime}
              onChange={onEndTimeChange}
              slotProps={{ textField: { size: "small", sx: { width: 110 } } }}
            />
          </>
        )}
        <Typography color="text.disabled">·</Typography>
        <DatePicker
          value={endDate}
          onChange={onEndDateChange}
          format="ddd, MMM D"
          minDate={beginDate}
          slotProps={{ textField: { size: "small", sx: { width: 150 } } }}
        />
      </Box>

      <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", mb: 1 }}>
        {recurrenceTrigger}
        {calendarSlot}
      </Box>

      <CollapseToggle onClick={onToggleMore} size="small">
        {moreOpen ? "▾" : "▸"} {intl.formatMessage({ id: "event.moreOptions" })}
      </CollapseToggle>

      {moreOpen && (
        <AdvancedBox sx={{ mt: 1.5 }}>
          <AdvRow>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {intl.formatMessage({ id: "event.allDay" })}
            </Typography>
            <Switch
              checked={allDay}
              onChange={(e) => onToggleAllDay(e.target.checked)}
            />
          </AdvRow>
          {recurrenceDetails}
          {busyFreeControl}
        </AdvancedBox>
      )}
    </Box>
  );
}
