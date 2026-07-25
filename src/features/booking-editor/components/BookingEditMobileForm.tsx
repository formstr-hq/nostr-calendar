import { useState } from "react";
import { Box, IconButton, TextField, Typography } from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useIntl } from "react-intl";
import { BottomSheet } from "../../../components/ui/BottomSheet";
import { SectionLabel } from "../../../components/ui/SectionLabel";
import { BookingBasicsSection } from "./BookingBasicsSection";
import { BookingDurationsSection } from "./BookingDurationsSection";
import { BookingWeeklyAvailabilitySection } from "./BookingWeeklyAvailabilitySection";
import { BookingDateWindowsSection } from "./BookingDateWindowsSection";
import { BookingBlockedDatesSection } from "./BookingBlockedDatesSection";
import { BookingIntakeFormSection } from "./BookingIntakeFormSection";
import { BookingSettingsSection } from "./BookingSettingsSection";
import { BookingEditFooter } from "./BookingEditFooter";
import { BookingLinkWidget } from "./BookingLinkWidget";
import { GroupCard, GroupRow, sectionLabelSx } from "./styled";
import type { UseSchedulingPageFormReturn } from "../hooks/useSchedulingPageForm";
import type { useSchedulingPageSave } from "../hooks/useSchedulingPageSave";

type SheetKey =
  | "basics"
  | "weekly"
  | "windows"
  | "blocked"
  | "intake"
  | "settings";

interface BookingEditMobileFormProps {
  isEditMode: boolean;
  form: UseSchedulingPageFormReturn;
  save: ReturnType<typeof useSchedulingPageSave>;
  canSave: boolean;
  onBack: () => void;
}

function MobileRow({
  label,
  hint,
  onClick,
  first,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  first?: boolean;
}) {
  return (
    <GroupRow first={first} onClick={onClick}>
      <Typography variant="body2">{label}</Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Typography variant="body2" color="text.secondary">
          {hint}
        </Typography>
        <ChevronRightIcon fontSize="small" sx={{ color: "text.secondary" }} />
      </Box>
    </GroupRow>
  );
}

export function BookingEditMobileForm({
  isEditMode,
  form,
  save,
  canSave,
  onBack,
}: BookingEditMobileFormProps) {
  const intl = useIntl();
  const [openSheet, setOpenSheet] = useState<SheetKey | null>(null);
  const closeSheet = () => setOpenSheet(null);

  const enabledDays = form.weekly.filter((d) => d.enabled).length;
  const weeklySummary =
    enabledDays === 0
      ? intl.formatMessage({ id: "scheduling.notSet" })
      : intl.formatMessage(
          { id: "scheduling.daysCount" },
          { count: enabledDays },
        );
  const windowsSummary =
    form.oneOffWindows.length === 0
      ? intl.formatMessage({ id: "scheduling.none" })
      : String(form.oneOffWindows.length);
  const blockedSummary =
    form.blockedWindows.length === 0
      ? intl.formatMessage({ id: "scheduling.none" })
      : String(form.blockedWindows.length);
  const intakeSummary =
    form.formData.formAttachments.length === 0
      ? intl.formatMessage({ id: "scheduling.none" })
      : String(form.formData.formAttachments.length);
  const basicsSummary =
    form.formData.eventTitle ||
    form.formData.location ||
    form.formData.description
      ? intl.formatMessage({ id: "scheduling.detailsConfigured" })
      : intl.formatMessage({ id: "scheduling.detailsEmpty" });

  return (
    <Box
      sx={{
        p: 2,
        display: "flex",
        flex: 1,
        flexDirection: "column",
        gap: 2,
        minHeight: "100vh",
        minWidth: 0,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <IconButton onClick={onBack} size="small">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h6">
          {isEditMode
            ? intl.formatMessage({ id: "scheduling.editSchedulingPage" })
            : intl.formatMessage({ id: "scheduling.createSchedulingPage" })}
        </Typography>
      </Box>

      {save.savedPageUrl && (
        <BookingLinkWidget
          compact
          url={save.savedPageUrl}
          onCopy={save.handleCopyLink}
        />
      )}

      <TextField
        fullWidth
        label="Title"
        value={form.formData.title}
        onChange={(e) => form.updateField("title", e.target.value)}
        required
        size="small"
      />

      <GroupCard>
        <MobileRow
          first
          label={intl.formatMessage({ id: "scheduling.basicInformation" })}
          hint={basicsSummary}
          onClick={() => setOpenSheet("basics")}
        />
      </GroupCard>

      <Box>
        <SectionLabel sx={sectionLabelSx}>
          {intl.formatMessage({ id: "scheduling.appointmentDuration" })}
        </SectionLabel>
        <BookingDurationsSection
          slotDurations={form.formData.slotDurations}
          toggleDuration={form.toggleDuration}
          customDuration={form.customDuration}
          setCustomDuration={form.setCustomDuration}
          addCustomDuration={form.addCustomDuration}
        />
      </Box>

      <Box>
        <SectionLabel sx={sectionLabelSx}>
          {intl.formatMessage({ id: "scheduling.availability" })}
        </SectionLabel>
        <GroupCard>
          <MobileRow
            first
            label={intl.formatMessage({ id: "scheduling.weeklyAvailability" })}
            hint={weeklySummary}
            onClick={() => setOpenSheet("weekly")}
          />
          <MobileRow
            label={intl.formatMessage({
              id: "scheduling.additionalDateWindows",
            })}
            hint={windowsSummary}
            onClick={() => setOpenSheet("windows")}
          />
          <MobileRow
            label={intl.formatMessage({ id: "scheduling.blockedDates" })}
            hint={blockedSummary}
            onClick={() => setOpenSheet("blocked")}
          />
        </GroupCard>
      </Box>

      <GroupCard>
        <MobileRow
          first
          label={intl.formatMessage({ id: "form.attachments" })}
          hint={intakeSummary}
          onClick={() => setOpenSheet("intake")}
        />
      </GroupCard>

      <GroupCard>
        <MobileRow
          first
          label={intl.formatMessage({ id: "scheduling.settings" })}
          hint=""
          onClick={() => setOpenSheet("settings")}
        />
      </GroupCard>

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

      <BottomSheet open={openSheet === "basics"} onClose={closeSheet}>
        <Box sx={{ p: 2 }}>
          <BookingBasicsSection
            formData={form.formData}
            updateField={(field, value) => form.updateField(field, value)}
            showTitle={false}
          />
        </Box>
      </BottomSheet>

      <BottomSheet open={openSheet === "weekly"} onClose={closeSheet}>
        <Box sx={{ p: 2 }}>
          <BookingWeeklyAvailabilitySection
            weekly={form.weekly}
            updateWeeklyDay={form.updateWeeklyDay}
            addWeeklyRange={form.addWeeklyRange}
            updateWeeklyRange={form.updateWeeklyRange}
            removeWeeklyRange={form.removeWeeklyRange}
          />
        </Box>
      </BottomSheet>

      <BottomSheet open={openSheet === "windows"} onClose={closeSheet}>
        <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Typography variant="subtitle1">
              {intl.formatMessage({
                id: "scheduling.additionalDateWindows",
              })}
            </Typography>
            <IconButton
              size="small"
              aria-label={intl.formatMessage({ id: "scheduling.addDate" })}
              onClick={form.addOneOffWindow}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Box>
          <BookingDateWindowsSection
            oneOffWindows={form.oneOffWindows}
            updateOneOffWindow={form.updateOneOffWindow}
            removeOneOffWindow={form.removeOneOffWindow}
          />
        </Box>
      </BottomSheet>

      <BottomSheet open={openSheet === "blocked"} onClose={closeSheet}>
        <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Typography variant="subtitle1">
              {intl.formatMessage({ id: "scheduling.blockedDates" })}
            </Typography>
            <IconButton
              size="small"
              aria-label={intl.formatMessage({ id: "scheduling.addDate" })}
              onClick={form.addBlockedWindow}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Box>
          <BookingBlockedDatesSection
            blockedWindows={form.blockedWindows}
            updateBlockedWindow={form.updateBlockedWindow}
            removeBlockedWindow={form.removeBlockedWindow}
          />
        </Box>
      </BottomSheet>

      <BottomSheet open={openSheet === "intake"} onClose={closeSheet}>
        <Box sx={{ p: 2 }}>
          <BookingIntakeFormSection
            attachedForms={form.formData.formAttachments}
            onAdd={form.addForm}
            onRemove={form.removeForm}
          />
        </Box>
      </BottomSheet>

      <BottomSheet open={openSheet === "settings"} onClose={closeSheet}>
        <Box sx={{ p: 2 }}>
          <BookingSettingsSection
            maxAdvance={form.formData.maxAdvance}
            buffer={form.formData.buffer}
            onMaxAdvanceChange={(value) =>
              form.updateField("maxAdvance", value)
            }
            onBufferChange={(value) => form.updateField("buffer", value)}
          />
        </Box>
      </BottomSheet>
    </Box>
  );
}
