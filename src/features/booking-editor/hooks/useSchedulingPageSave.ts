import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { useSchedulingPages } from "../../../stores/schedulingPages";
import { getRelays } from "../../../common/relayConfig";
import type {
  ISchedulingPage,
  IAvailabilityWindow,
} from "../../../utils/types";
import { useRelayPublishStatus } from "../../event-editor/hooks/useRelayPublishStatus";
import { serializeBlockedWindow } from "./useSchedulingPageForm";
import type {
  BlockedWindow,
  UseSchedulingPageFormReturn,
} from "./useSchedulingPageForm";

interface UseSchedulingPageSaveOptions {
  isEditMode: boolean;
  existingPage: ISchedulingPage | null;
  form: UseSchedulingPageFormReturn;
  onCreated?: (naddr: string) => void;
}

export function useSchedulingPageSave({
  isEditMode,
  existingPage,
  form,
  onCreated,
}: UseSchedulingPageSaveOptions) {
  const intl = useIntl();
  const { createPage, updatePage, getNAddr, getPageUrl } = useSchedulingPages();
  const [processing, setProcessing] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });
  const [savedNAddr, setSavedNAddr] = useState<string | null>(null);
  const [savedPageUrl, setSavedPageUrl] = useState<string | null>(null);
  const {
    relayStatus,
    publishingRelays,
    initRelays,
    onRelayComplete,
    reset: resetRelayStatus,
  } = useRelayPublishStatus();

  // The link is not merely a post-save success message: an existing page
  // should always expose its working, view-key-bearing URL while editing.
  useEffect(() => {
    if (!existingPage) return;
    setSavedNAddr(getNAddr(existingPage));
    setSavedPageUrl(getPageUrl(existingPage));
  }, [existingPage, getNAddr, getPageUrl]);

  const handleSave = async () => {
    const relaysToPublish = getRelays();
    initRelays(relaysToPublish);
    setProcessing(true);
    try {
      // Auto-detect the host's timezone from the browser. The host enters
      // availability windows like "09:00" thinking in their own local time;
      // storing that timezone alongside lets viewers in any other timezone
      // see the host's "9 AM" anchored correctly. Falls back to UTC if the
      // browser refuses to report a tz (very old environments).
      const browserTimezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const { formData } = form;
      const availabilityWindows: IAvailabilityWindow[] =
        form.buildAvailabilityWindows();
      const pageData: Omit<
        ISchedulingPage,
        "id" | "eventId" | "user" | "createdAt"
      > = {
        title: formData.title,
        description: formData.description,
        location: formData.location,
        slotDurations: formData.slotDurations,
        blockedDates: form.blockedWindows.map((w: BlockedWindow) =>
          serializeBlockedWindow(w),
        ),
        maxAdvance: formData.maxAdvance,
        buffer: formData.buffer,
        expiry: formData.expiry,
        timezone:
          isEditMode && existingPage?.timezone
            ? existingPage.timezone
            : browserTimezone,
        minNotice: 0,
        durationMode: "fixed",
        eventTitle: formData.eventTitle || undefined,
        image: formData.image || undefined,
        availabilityWindows,
        formAttachments:
          formData.formAttachments.length > 0
            ? formData.formAttachments
            : undefined,
      };

      let saved: ISchedulingPage;
      if (isEditMode && existingPage) {
        saved = await updatePage(
          { ...existingPage, ...pageData },
          { onRelayComplete },
        );
      } else {
        saved = await createPage(pageData, { onRelayComplete });
      }

      const addr = getNAddr(saved);
      setSavedNAddr(addr);
      setSavedPageUrl(getPageUrl(saved));
      if (!isEditMode) {
        onCreated?.(addr);
      }
      setSnackbar({
        open: true,
        message: isEditMode
          ? intl.formatMessage({ id: "scheduling.pageUpdated" })
          : intl.formatMessage({ id: "scheduling.pageCreated" }),
        severity: "success",
      });
      resetRelayStatus();
    } catch (e) {
      console.error(e);
      setSnackbar({
        open: true,
        message:
          e instanceof Error ? e.message : "Failed to save scheduling page",
        severity: "error",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleCopyLink = () => {
    if (!savedPageUrl) return;
    navigator.clipboard.writeText(savedPageUrl);
    setSnackbar({
      open: true,
      message: intl.formatMessage({ id: "scheduling.linkCopied" }),
      severity: "success",
    });
  };

  const isPublishing = publishingRelays.length > 0;
  const relayDotsLabel = intl.formatMessage(
    { id: "scheduling.publishingToRelays" },
    { count: getRelays().length },
  );

  return {
    processing,
    snackbar,
    setSnackbar,
    savedNAddr,
    savedPageUrl,
    handleSave,
    handleCopyLink,
    relayStatus,
    publishingRelays,
    relayDotsLabel,
    isPublishing,
  };
}
