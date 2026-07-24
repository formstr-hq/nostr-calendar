import { Box, TextField } from "@mui/material";
import { useIntl } from "react-intl";
import { EventParticipants } from "../../../components/EventParticipants";
import { SectionLabel } from "../../../components/ui/SectionLabel";
import type { IFormAttachment } from "../../../utils/types";
import { WhenFields } from "./WhenFields";
import { CalendarLocationGroup } from "./CalendarLocationGroup";
import { EventAttachmentsSection } from "./EventAttachmentsSection";
import { EventNotesSection } from "./EventNotesSection";
import { EventNotificationsSection } from "./EventNotificationsSection";
import { EventEditHeaderMobile } from "./EventEditHeaderMobile";
import { EventEditFooter } from "./EventEditFooter";
import { GroupCard, sectionLabelSx } from "./styled";
import type { EventEditFormProps } from "./types";

export function EventEditMobileForm(props: EventEditFormProps) {
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
        display: "flex",
        flexDirection: "column",
        gap: 2,
        pb: display === "modal" ? 3 : 2,
      }}
    >
      <Box sx={{ px: 2 }}>
          <EventEditHeaderMobile
            mode={mode}
            display={display}
            isPrivate={isPrivate}
            onClose={handleClose}
        />
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, px: 2 }}>
        <TextField
          fullWidth
          placeholder={intl.formatMessage({ id: "event.enterTitle" })}
          value={eventDetails.title}
          onChange={(e) => updateField("title", e.target.value)}
          required
          size="small"
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
        />

        <WhenFields
          variant="mobile"
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
        />

        <CalendarLocationGroup
          selectedCalendarId={selectedCalendarId}
          onCalendarChange={setSelectedCalendarId}
          calendarsEmpty={calendars.length === 0}
          location={eventDetails.location}
          onLocationChange={(location) => updateField("location", location)}
        />

        <GroupCard sx={{ p: 2 }}>
          <SectionLabel sx={sectionLabelSx}>
            {intl.formatMessage({ id: "event.invitees" })}
          </SectionLabel>
          <EventParticipants
            participants={eventDetails.participants}
            authorPubkey={eventDetails.user}
            onChange={(participants) =>
              updateField("participants", participants)
            }
          />
        </GroupCard>

        {isPrivate && (
          <EventAttachmentsSection
            variant="mobile"
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
          variant="mobile"
          value={eventDetails.description}
          onChange={(value) => updateField("description", value)}
        />

        <EventNotificationsSection
          variant="mobile"
          offsets={notificationOffsets}
          onChange={setNotificationOffsets}
        />

        <EventEditFooter
          showActionButtons
          showCancelButton={display === "page"}
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
    </Box>
  );
}
