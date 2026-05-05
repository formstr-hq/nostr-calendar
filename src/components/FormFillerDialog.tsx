/**
 * Form Filler Dialog
 *
 * Opens a Formstr-rendered form (NIP-101, kind 30168) for an attached
 * `IFormAttachment` from a private calendar event. The user fills the form
 * and the response (kind 1069) is signed via the active `signerManager`
 * signer and submitted by the SDK.
 *
 * Embedding model:
 * - We use `@formstr/sdk` (`FormstrSDK`) which renders the form as an HTML
 *   string and exposes a DOM-level submit listener. The HTML comes from a
 *   trusted Nostr form template — the same source the official Formstr web
 *   app trusts. No additional sanitization is applied.
 *
 * Failure model:
 * - On fetch failure: show a retry button. We do NOT silently proceed with
 *   the surrounding flow (e.g. invitation acceptance) so the caller can
 *   distinguish "user gave up" from "user actually submitted".
 * - On submit failure: surface the error and let the user retry.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import type { Theme } from "@mui/material/styles";
import { alpha } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { FormstrSDK } from "@formstr/sdk";
import type { Event as NostrEvent, EventTemplate } from "nostr-tools";
import { useIntl } from "react-intl";
import type { IFormAttachment } from "../utils/types";
import { signerManager } from "../common/signer";
import { buildFormstrUrl } from "../utils/formLink";

// SDK's NormalizedForm shape (subset we touch)
type SdkForm = {
  id: string;
  name?: string;
  html?: { form: string };
};

type Props = {
  open: boolean;
  attachment: IFormAttachment | null;
  /** 1-based position of this attachment in a list, for multi-form flows. */
  index?: number;
  /** Total number of attachments in the list, for multi-form flows. */
  total?: number;
  onClose: () => void;
  onSubmitted: (response: NostrEvent) => void;
};

export function FormFillerDialog({
  open,
  attachment,
  index,
  total,
  onClose,
  onSubmitted,
}: Props) {
  const intl = useIntl();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sdkRef = useRef<FormstrSDK | null>(null);
  // Stored by the form-setup effect so DialogActions can trigger submit.
  const submitFnRef = useRef<(() => void) | null>(null);

  const [form, setForm] = useState<SdkForm | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fetchForm = useCallback(async () => {
    if (!attachment) return;
    setLoading(true);
    setFetchError(null);
    setSubmitError(null);
    setForm(null);
    try {
      // Create a fresh SDK instance per fetch so submit listeners do not
      // accumulate across retries or re-opened dialogs.
      const sdk = new FormstrSDK();
      sdkRef.current = sdk;
      const fetched = (await (
        attachment.viewKey
          ? sdk.fetchFormWithViewKey(attachment.naddr, attachment.viewKey)
          : sdk.fetchForm(attachment.naddr)
      )) as SdkForm;
      sdk.renderHtml(fetched as never);
      setForm(fetched);
    } catch (err) {
      console.error("[FormFillerDialog] fetch failed", err);
      setFetchError(
        err instanceof Error
          ? err.message
          : intl.formatMessage({ id: "form.fetchError" }),
      );
    } finally {
      setLoading(false);
    }
  }, [attachment, intl]);

  // Fetch the form template only when we should render it.
  useEffect(() => {
    if (open && attachment) fetchForm();
    if (!open) {
      setForm(null);
      setFetchError(null);
      setSubmitError(null);
      sdkRef.current = null;
      submitFnRef.current = null;
    }
  }, [open, attachment, fetchForm]);

  // After form HTML is in the DOM, attach the SDK submit listener and wire
  // submitFnRef so the DialogActions Submit button can trigger it.
  useEffect(() => {
    if (!form || !sdkRef.current || !containerRef.current) return;
    const sdk = sdkRef.current;

    const signer = async (event: EventTemplate): Promise<NostrEvent> => {
      const active = await signerManager.getSigner();
      return active.signEvent(event);
    };

    sdk.attachSubmitListener(form as never, signer, {
      onSuccess: ({ event }) => {
        setSubmitting(false);
        onSubmitted(event);
      },
      onError: (err) => {
        console.error("[FormFillerDialog] submit failed", err);
        setSubmitting(false);
        setSubmitError(
          err instanceof Error
            ? err.message
            : intl.formatMessage({ id: "form.submitError" }),
        );
      },
    });

    const root = containerRef.current;
    const formEl = root.querySelector("form");
    if (!formEl) return;

    // Wire the external submit button.
    submitFnRef.current = () => formEl.requestSubmit();

    const onSubmitDom = () => {
      setSubmitting(true);
      setSubmitError(null);
    };
    formEl.addEventListener("submit", onSubmitDom);
    return () => {
      submitFnRef.current = null;
      formEl.removeEventListener("submit", onSubmitDom);
    };
  }, [form, intl, onSubmitted]);

  const showForm = !loading && !fetchError && form;

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      fullScreen={isMobile}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle sx={{ pr: 6 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h6" component="span">
            {form?.name || intl.formatMessage({ id: "form.fillTitle" })}
          </Typography>
          {total && total > 1 && index ? (
            <Typography variant="body2" color="text.secondary">
              ({index} / {total})
            </Typography>
          ) : null}
        </Stack>
        <IconButton
          aria-label="close"
          onClick={onClose}
          disabled={submitting}
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ px: { xs: 2, sm: 3 }, py: 3 }}>
        {loading && (
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress />
          </Box>
        )}

        {fetchError && !loading && (
          <Stack spacing={2}>
            <Alert severity="error">{fetchError}</Alert>
            <Button
              variant="outlined"
              onClick={fetchForm}
              sx={{ alignSelf: "flex-start" }}
            >
              {intl.formatMessage({ id: "form.retry" })}
            </Button>
          </Stack>
        )}

        {showForm && (
          <>
            {submitError && (
              <Alert severity="error" sx={{ mb: 2.5 }}>
                {submitError}
              </Alert>
            )}
            {/* SDK-generated HTML styled via scoped sx. Source is a trusted
                Nostr form template. The SDK's own h2 and submit button are
                hidden — we render them in the dialog chrome instead. */}
            <Box
              ref={containerRef}
              sx={buildFormSx(theme)}
              dangerouslySetInnerHTML={{ __html: form.html?.form ?? "" }}
            />
          </>
        )}
      </DialogContent>

      <DialogActions
        sx={{
          px: { xs: 2, sm: 3 },
          py: 1.5,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 1,
        }}
      >
        {/* Always-visible "Open in Formstr" link */}
        {attachment ? (
          <Button
            size="small"
            endIcon={<OpenInNewIcon fontSize="inherit" />}
            href={buildFormstrUrl(attachment)}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ textTransform: "none", color: "text.secondary", flexShrink: 0 }}
          >
            {intl.formatMessage({ id: "form.openExternal" })}
          </Button>
        ) : (
          <Box />
        )}

        <Stack direction="row" spacing={1} alignItems="center">
          {submitting && (
            <Stack direction="row" spacing={0.75} alignItems="center">
              <CircularProgress size={14} />
              <Typography variant="body2" color="text.secondary">
                {intl.formatMessage({ id: "form.submitting" })}
              </Typography>
            </Stack>
          )}
          <Button onClick={onClose} disabled={submitting} color="inherit">
            {intl.formatMessage({ id: "form.cancel" })}
          </Button>
          {showForm && (
            <Button
              variant="contained"
              disabled={submitting || loading}
              onClick={() => submitFnRef.current?.()}
            >
              {intl.formatMessage({ id: "form.submit" })}
            </Button>
          )}
        </Stack>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Scoped styles for the SDK-generated form HTML. The SDK emits unstyled
 * standard HTML: `<label>LabelText<input></label>` for text fields and
 * `<fieldset>` for radio groups. We stack everything vertically and apply
 * Material-like input styling.
 */
function buildFormSx(theme: Theme) {
  return {
    "& form": {
      display: "flex",
      flexDirection: "column",
      gap: "20px",
      padding: 0,
      margin: 0,
    },
    // The SDK duplicates the form name in an h2; DialogTitle already shows it.
    "& form h2": { display: "none" },
    // We supply our own Submit button in DialogActions.
    "& form button[type='submit']": { display: "none" },

    // label-type fields: plain <div> used for descriptions / section headings.
    "& form > div": {
      fontSize: "0.875rem",
      color: theme.palette.text.secondary,
      lineHeight: 1.6,
    },

    // Text field wrappers: <label>LabelText<input ...></label>
    // The label element acts as both the caption and the wrapper.
    "& form > label": {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      fontSize: "0.875rem",
      fontWeight: 500,
      color: theme.palette.text.secondary,
      cursor: "default",
    },

    // Text inputs
    "& form input[type='text']": {
      boxSizing: "border-box",
      width: "100%",
      border: `1px solid ${theme.palette.divider}`,
      borderRadius: "6px",
      padding: "10px 14px",
      fontSize: "1rem",
      fontFamily: "inherit",
      fontWeight: 400,
      color: theme.palette.text.primary,
      backgroundColor: "transparent",
      outline: "none",
      transition: "border-color 150ms, box-shadow 150ms",
    },
    "& form input[type='text']:hover": {
      borderColor: theme.palette.text.primary,
    },
    "& form input[type='text']:focus": {
      borderColor: theme.palette.primary.main,
      boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.15)}`,
    },

    // Radio group fieldsets
    "& form fieldset": {
      border: "none",
      padding: 0,
      margin: 0,
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      fontSize: "0.875rem",
      fontWeight: 500,
      color: theme.palette.text.secondary,
    },
    "& form fieldset br": { display: "none" },
    // Individual radio option labels (inside fieldset)
    "& form fieldset label": {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      gap: "8px",
      fontWeight: 400,
      color: theme.palette.text.primary,
      cursor: "pointer",
    },
    "& form input[type='radio']": {
      accentColor: theme.palette.primary.main,
      width: "16px",
      height: "16px",
      cursor: "pointer",
      flexShrink: 0,
    },
  } as const;
}
