import { Box, Button, IconButton, Paper, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useIntl } from "react-intl";
import { BookingBasicsSection } from "./BookingBasicsSection";
import { BookingDurationsSection } from "./BookingDurationsSection";
import { BookingWeeklyAvailabilitySection } from "./BookingWeeklyAvailabilitySection";
import { BookingDateWindowsSection } from "./BookingDateWindowsSection";
import { BookingBlockedDatesSection } from "./BookingBlockedDatesSection";
import { BookingIntakeFormSection } from "./BookingIntakeFormSection";
import { BookingSettingsSection } from "./BookingSettingsSection";
import { BookingEditFooter } from "./BookingEditFooter";
import { BookingLivePreview } from "./BookingLivePreview";
import { BookingLinkWidget } from "./BookingLinkWidget";
import type { UseSchedulingPageFormReturn } from "../hooks/useSchedulingPageForm";
import type { useSchedulingPageSave } from "../hooks/useSchedulingPageSave";

interface BookingEditDesktopFormProps {
  isEditMode: boolean;
  form: UseSchedulingPageFormReturn;
  save: ReturnType<typeof useSchedulingPageSave>;
  canSave: boolean;
  onBack: () => void;
}

export function BookingEditDesktopForm({
  isEditMode,
  form,
  save,
  canSave,
  onBack,
}: BookingEditDesktopFormProps) {
  const intl = useIntl();

  return (
    <Box
      sx={{
        maxWidth: 1240,
        minHeight: "calc(100dvh - 64px)",
        mx: "auto",
        p: { md: 3, lg: 4 },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", mb: 3, gap: 1 }}>
        <IconButton onClick={onBack} size="small">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5">
          {isEditMode
            ? intl.formatMessage({ id: "scheduling.editSchedulingPage" })
            : intl.formatMessage({ id: "scheduling.createSchedulingPage" })}
        </Typography>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {intl.formatMessage({ id: "scheduling.featureDescription" })}
      </Typography>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 380px",
          gap: 3,
          alignItems: "start",
          minHeight: "calc(100dvh - 185px)",
        }}
      >
        <Box
          sx={{ display: "flex", flexDirection: "column", minHeight: "100%" }}
        >
          <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
            <Typography variant="subtitle1" sx={{ mb: 2 }}>
              {intl.formatMessage({ id: "scheduling.basicInformation" })}
            </Typography>
            <BookingBasicsSection
              formData={form.formData}
              updateField={(field, value) => form.updateField(field, value)}
            />
          </Paper>

          <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
            <Typography variant="subtitle1" sx={{ mb: 2 }}>
              {intl.formatMessage({ id: "scheduling.appointmentDuration" })}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {intl.formatMessage({ id: "scheduling.durationsHelp" })}
            </Typography>
            <BookingDurationsSection
              slotDurations={form.formData.slotDurations}
              toggleDuration={form.toggleDuration}
              customDuration={form.customDuration}
              setCustomDuration={form.setCustomDuration}
              addCustomDuration={form.addCustomDuration}
            />
          </Paper>

          <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
            <Typography variant="subtitle1" sx={{ mb: 2 }}>
              {intl.formatMessage({ id: "scheduling.weeklyAvailability" })}
            </Typography>
            <BookingWeeklyAvailabilitySection
              weekly={form.weekly}
              updateWeeklyDay={form.updateWeeklyDay}
              addWeeklyRange={form.addWeeklyRange}
              updateWeeklyRange={form.updateWeeklyRange}
              removeWeeklyRange={form.removeWeeklyRange}
            />
          </Paper>

          <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 1,
              }}
            >
              <Typography variant="subtitle1">
                {intl.formatMessage({ id: "scheduling.additionalDateWindows" })}
              </Typography>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={form.addOneOffWindow}
              >
                {intl.formatMessage({ id: "scheduling.addDate" })}
              </Button>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {intl.formatMessage({
                id: "scheduling.additionalDateWindowsHelp",
              })}
            </Typography>
            <BookingDateWindowsSection
              oneOffWindows={form.oneOffWindows}
              updateOneOffWindow={form.updateOneOffWindow}
              removeOneOffWindow={form.removeOneOffWindow}
            />
          </Paper>

          <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 1,
              }}
            >
              <Typography variant="subtitle1">
                {intl.formatMessage({ id: "scheduling.blockedDates" })}
              </Typography>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={form.addBlockedWindow}
              >
                {intl.formatMessage({ id: "scheduling.addDate" })}
              </Button>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {intl.formatMessage({ id: "scheduling.blockedDatesHelp" })}
            </Typography>
            <BookingBlockedDatesSection
              blockedWindows={form.blockedWindows}
              updateBlockedWindow={form.updateBlockedWindow}
              removeBlockedWindow={form.removeBlockedWindow}
            />
          </Paper>

          <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
            <BookingIntakeFormSection
              attachedForms={form.formData.formAttachments}
              onAdd={form.addForm}
              onRemove={form.removeForm}
            />
          </Paper>

          <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
            <Typography variant="subtitle1" sx={{ mb: 2 }}>
              {intl.formatMessage({ id: "scheduling.settings" })}
            </Typography>
            <BookingSettingsSection
              maxAdvance={form.formData.maxAdvance}
              buffer={form.formData.buffer}
              onMaxAdvanceChange={(value) =>
                form.updateField("maxAdvance", value)
              }
              onBufferChange={(value) => form.updateField("buffer", value)}
            />
          </Paper>

          <BookingEditFooter
            isEditMode={isEditMode}
            savedNAddr={save.savedNAddr}
            processing={save.processing}
            canSave={canSave}
            onCancel={onBack}
            onSave={save.handleSave}
            relayDotsLabel={save.relayDotsLabel}
            publishingRelays={save.publishingRelays}
            relayStatus={save.relayStatus}
            isPublishing={save.isPublishing}
          />
        </Box>
        <Box
          sx={{
            position: "sticky",
            top: 24,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <BookingLivePreview form={form} />
          {save.savedPageUrl && (
            <BookingLinkWidget
              url={save.savedPageUrl}
              onCopy={save.handleCopyLink}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}
