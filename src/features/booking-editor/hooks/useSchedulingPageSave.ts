import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { useSchedulingPages } from "../../../stores/schedulingPages";
import { getRelays } from "../../../common/relayConfig";
import { publishSignedEvent } from "../../../nostr/core";
import type { Event } from "nostr-tools";
import type {
  ISchedulingPage,
  IAvailabilityWindow,
} from "../../../utils/types";
import { serializeBlockedWindow } from "./useSchedulingPageForm";
import type {
  BlockedWindow,
  UseSchedulingPageFormReturn,
} from "./useSchedulingPageForm";
import {
  usePublishActivity,
  usePublishActivityStore,
  type PublishStepDefinition,
} from "../../../stores/publishActivity";

const BOOKING_PAGE_SAVE_FLOW_ID = "booking-page-save";

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
  const [relayDetailsOpen, setRelayDetailsOpen] = useState(false);
  const [retryingStepId, setRetryingStepId] = useState<string | null>(null);
  const flow = usePublishActivity(BOOKING_PAGE_SAVE_FLOW_ID);
  const steps = flow?.steps ?? [];

  // The link is not merely a post-save success message: an existing page
  // should always expose its working, view-key-bearing URL while editing.
  useEffect(() => {
    if (!existingPage) return;
    setSavedNAddr(getNAddr(existingPage));
    setSavedPageUrl(getPageUrl(existingPage));
  }, [existingPage, getNAddr, getPageUrl]);

  const handleSave = async () => {
    const relaysToPublish = getRelays();
    setRelayDetailsOpen(false);
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

      let saved: ISchedulingPage | null = null;
      let viewKeyEvent: Event | null = null;
      const stepDefs: PublishStepDefinition[] = [
        {
          id: "publish-booking-page",
          labelId: "scheduling.step.publishPage",
          relays: relaysToPublish,
          blocking: true,
          run: async (callbacks) => {
            saved =
              isEditMode && existingPage
                ? await updatePage(
                    { ...existingPage, ...pageData },
                    {
                      onRelayComplete: callbacks.onRelayComplete,
                      onKeyRelayComplete: (url, success) =>
                        callbacks.reportRelayOutcome(
                          "publish-view-key",
                          url,
                          success,
                        ),
                      onKeyEventReady: (event) => {
                        viewKeyEvent = event;
                      },
                      deferKeyPublish: true,
                    },
                  )
                : await createPage(pageData, {
                    onRelayComplete: callbacks.onRelayComplete,
                    onKeyRelayComplete: (url, success) =>
                      callbacks.reportRelayOutcome(
                        "publish-view-key",
                        url,
                        success,
                      ),
                    onKeyEventReady: (event) => {
                      viewKeyEvent = event;
                    },
                    deferKeyPublish: true,
                  });
          },
        },
        {
          id: "publish-view-key",
          labelId: "scheduling.step.publishViewKey",
          relays: relaysToPublish,
          blocking: true,
          run: async (callbacks) => {
            if (!viewKeyEvent) return;
            await publishSignedEvent(viewKeyEvent, {
              onRelayComplete: callbacks.onRelayComplete,
            });
          },
        },
      ];
      await usePublishActivityStore
        .getState()
        .runFlow(BOOKING_PAGE_SAVE_FLOW_ID, stepDefs);
      if (!saved) throw new Error("Scheduling page was not saved.");

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

  const handleRetryStep = async (stepId: string) => {
    setRetryingStepId(stepId);
    try {
      await usePublishActivityStore
        .getState()
        .retryStep(BOOKING_PAGE_SAVE_FLOW_ID, stepId);
    } catch {
      // Per-relay outcomes are rendered by the activity UI.
    } finally {
      setRetryingStepId(null);
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

  const hasRelayErrors = steps.some((step) => step.status === "error");

  return {
    processing,
    snackbar,
    setSnackbar,
    savedNAddr,
    savedPageUrl,
    handleSave,
    handleCopyLink,
    steps,
    relayDetailsOpen,
    setRelayDetailsOpen,
    retryingStepId,
    handleRetryStep,
    hasRelayErrors,
  };
}
