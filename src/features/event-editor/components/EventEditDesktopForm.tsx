import { Box, TextField, Typography } from "@mui/material";
import { useIntl } from "react-intl";
import { EventParticipants } from "../../../components/EventParticipants";
import { CalendarListSelect } from "../../../components/CalendarListSelect";
import { SectionLabel } from "../../../components/ui/SectionLabel";
import type { IFormAttachment } from "../../../utils/types";
import { WhenFields } from "./WhenFields";
import { EventAttachmentsSection } from "./EventAttachmentsSection";
import { EventNotesSection } from "./EventNotesSection";
import { EventNotificationsSection } from "./EventNotificationsSection";
import { EventEditHeaderDesktop } from "./EventEditHeaderDesktop";
import { EventEditFooter } from "./EventEditFooter";
import { sectionLabelSx } from "./styled";
import type { EventEditFormProps } from "./types";

export function EventEditDesktopForm(props: EventEditFormProps) {
  const intl = useIntl();
  const {
    mode,
    display,
    eventDetails,
    updateField,
    isPrivate,
    selectedCalendarId,
    setSelectedCalendarId,
    calendars,
    notificationOffsets,
    setNotificationOffsets,
    handleClose,
  } = props;
  const attachedForms: IFormAttachment[] = eventDetails.forms ?? [];

  return (
    <Box
      sx={{
        maxWidth: display === "page" ? 900 : undefined,
        mx: display === "page" ? "auto" : undefined,
        p: display === "page" ? 3 : 3.5,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 0,
      }}
    >
      <Box sx={{ mb: 2.5 }}>
        <EventEditHeaderDesktop
          mode={mode}
          display={display}
          isPrivate={isPrivate}
          onClose={handleClose}
        />
      </Box>

      <TextField
        fullWidth
        placeholder={intl.formatMessage({ id: "event.enterTitle" })}
        value={eventDetails.title}
        onChange={(e) => updateField("title", e.target.value)}
        required
        size="small"
        aria-label="event title"
        sx={{ mb: 1.5 }}
        slotProps={{
          htmlInput: {
            "data-testid": "event-title",
            "aria-label": "event title",
          },
        }}
      />

      <TextField
        fullWidth
        placeholder={intl.formatMessage({ id: "event.imageUrlPlaceholder" })}
        value={eventDetails.image || ""}
        onChange={(e) => updateField("image", e.target.value)}
        size="small"
        sx={{ mb: 3 }}
      />

      <WhenFields
        variant="desktop"
        allDay={props.allDay}
        onToggleAllDay={props.onToggleAllDay}
        beginDate={props.beginDate}
        beginTime={props.beginTime}
        endDate={props.endDate}
        endTime={props.endTime}
        onBeginDateChange={props.onBeginDateChange}
        onBeginTimeChange={props.onBeginTimeChange}
        onEndDateChange={props.onEndDateChange}
        onEndTimeChange={props.onEndTimeChange}
        recurrenceSelectValue={props.recurrenceSelectValue}
        isCustomRecurrence={props.isCustomRecurrence}
        customRule={props.customRule}
        recurrenceEndMode={props.recurrenceEndMode}
        recurrenceCount={props.recurrenceCount}
        recurrenceUntilDate={props.recurrenceUntilDate}
        eventStart={eventDetails.begin}
        onFrequencyChange={props.onFrequencyChange}
        onEndModeChange={props.onEndModeChange}
        onCountChange={props.onCountChange}
        onUntilDateChange={props.onUntilDateChange}
        onEditCustom={props.onEditCustom}
        moreOpen={props.moreOpen}
        onToggleMore={props.onToggleMore}
        publishBusy={props.publishBusy}
        supportsBusyListPublish={props.supportsBusyListPublish}
        onPublishBusyChange={props.onPublishBusyChange}
        calendarSlot={
          <CalendarListSelect
            value={selectedCalendarId}
            onChange={setSelectedCalendarId}
            variant="pill"
            label={intl.formatMessage({ id: "event.calendar" })}
          />
        }
        calendarHelper={
          mode === "create" && calendars.length === 0 ? (
            <Typography variant="caption" color="warning.main">
              {intl.formatMessage({ id: "event.calendarRequired" })}
            </Typography>
          ) : undefined
        }
      />

      <Box sx={{ mb: 3 }}>
        <SectionLabel sx={sectionLabelSx}>
          {intl.formatMessage({ id: "event.people" })}
        </SectionLabel>
        <EventParticipants
          participants={eventDetails.participants}
          authorPubkey={eventDetails.user}
          onChange={(participants) => updateField("participants", participants)}
        />
      </Box>

      <Box sx={{ mb: 3 }}>
        <SectionLabel sx={sectionLabelSx}>
          {intl.formatMessage({ id: "event.where" })}
        </SectionLabel>
        <TextField
          fullWidth
          placeholder={intl.formatMessage({ id: "event.enterLocation" })}
          value={eventDetails.location.join(", ")}
          onChange={(e) =>
            updateField(
              "location",
              e.target.value.split(",").map((loc) => loc.trim()),
            )
          }
          size="small"
        />
      </Box>

      {isPrivate && (
        <EventAttachmentsSection
          variant="desktop"
          attachedForms={attachedForms}
          onAdd={(form) => updateField("forms", [...attachedForms, form])}
          onRemove={(naddr) =>
            updateField(
              "forms",
              attachedForms.filter((f) => f.naddr !== naddr),
            )
          }
        />
      )}

      <EventNotesSection
        variant="desktop"
        value={eventDetails.description}
        onChange={(value) => updateField("description", value)}
      />

      <EventNotificationsSection
        variant="desktop"
        offsets={notificationOffsets}
        onChange={setNotificationOffsets}
      />

      <EventEditFooter
        showActionButtons
        processing={props.processing}
        buttonDisabled={props.buttonDisabled}
        handleClose={props.handleClose}
        handleSave={props.handleSave}
        relayDotsLabel={props.relayDotsLabel}
        publishingRelays={props.publishingRelays}
        relayStatus={props.relayStatus}
        showRelayDetailsButton={props.showRelayDetailsButton}
        partialSaveRelayIssues={props.partialSaveRelayIssues}
        setRelayDetailsOpen={props.setRelayDetailsOpen}
        hasSignedEventForRetry={props.hasSignedEventForRetry}
        acceptedCount={props.acceptedCount}
        failedCount={props.failedCount}
        totalCount={props.totalCount}
      />
    </Box>
  );
}
