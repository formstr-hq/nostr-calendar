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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { FormstrSDK } from "@formstr/sdk";
import dayjs from "dayjs";
import type { Event as NostrEvent, EventTemplate } from "nostr-tools";
import { useIntl } from "react-intl";
import type { IFormAttachment } from "../utils/types";
import { signerManager } from "../common/signer";
import { useFormSubmissionStatus } from "../hooks/useFormSubmissionStatus";
import { useUser } from "../stores/user";
import { fetchAttachedFormCached } from "../utils/formAttachment";
import { buildFormstrUrl } from "../utils/formLink";

type SdkOption = {
  id: string;
  labelHtml: string;
  config?: { isOther?: boolean };
};

type SdkField = {
  id: string;
  type: string;
  labelHtml: string;
  options?: SdkOption[] | unknown;
  config?: { renderElement?: string };
};
type SdkForm = {
  id: string;
  name?: string;
  html?: { form: string };
  fields?: Record<string, SdkField>;
  fieldOrder?: string[];
};

type ResponseRow = {
  fieldId: string;
  question: string;
  answer: string;
};

function plainText(html: string | undefined): string {
  if (!html) return "";
  if (typeof document === "undefined") {
    return html.replace(/<[^>]*>/g, "").trim();
  }
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || div.innerText || "").trim();
}

function parseMetadata(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function formatAnswer(
  field: SdkField | undefined,
  rawValue: string | undefined,
  metadataRaw: string | undefined,
  noAnswerLabel: string,
): string {
  if (!rawValue) return noAnswerLabel;
  if (!field) return rawValue;

  if (field.type === "option" && Array.isArray(field.options)) {
    const metadata = parseMetadata(metadataRaw);
    const selectedIds = rawValue.split(";").filter(Boolean);
    const labels = selectedIds.map((id) => {
      const options = Array.isArray(field.options) ? field.options : [];
      const option = options.find((entry) => entry.id === id);
      const label = option ? plainText(option.labelHtml) : id;
      if (option?.config?.isOther && typeof metadata.message === "string") {
        return `${label} (${metadata.message})`;
      }
      return label;
    });
    return labels.length > 0 ? labels.join(", ") : rawValue;
  }

  if (field.type === "grid") {
    try {
      const parsed = JSON.parse(rawValue) as Record<string, string>;
      if (parsed && typeof parsed === "object") {
        return Object.entries(parsed)
          .map(([rowId, selected]) => `${rowId}: ${selected}`)
          .join(" | ");
      }
    } catch {
      return rawValue;
    }
  }

  if (field.config?.renderElement === "datetime") {
    const timestamp = Number(rawValue);
    if (Number.isFinite(timestamp)) {
      return new Date(timestamp * 1000).toLocaleString();
    }
  }

  if (field.config?.renderElement === "fileUpload") {
    try {
      const metadata = JSON.parse(rawValue) as { filename?: string };
      if (metadata.filename) return metadata.filename;
    } catch {
      return rawValue;
    }
  }

  return rawValue;
}

function responseRowsFromEvent(
  response: NostrEvent,
  form: SdkForm | null,
  noAnswerLabel: string,
  unknownQuestionLabel: string,
): ResponseRow[] {
  const responseTags = response.tags.filter(
    (tag) => tag[0] === "response" && tag[1],
  );
  const tagsByField = new Map<string, string[]>();
  for (const tag of responseTags) {
    tagsByField.set(tag[1], tag);
  }

  const rows: ResponseRow[] = [];
  const consumed = new Set<string>();
  const fields = form?.fields ?? {};
  const fieldOrder = form?.fieldOrder ?? [];

  for (const fieldId of fieldOrder) {
    const field = fields[fieldId];
    if (!field || field.type === "label") continue;
    const tag = tagsByField.get(fieldId);
    if (!tag) continue;
    consumed.add(fieldId);
    rows.push({
      fieldId,
      question:
        plainText(field.labelHtml) || `${unknownQuestionLabel} ${fieldId}`,
      answer: formatAnswer(field, tag[2], tag[3], noAnswerLabel),
    });
  }

  for (const tag of responseTags) {
    const fieldId = tag[1];
    if (consumed.has(fieldId)) continue;
    const field = fields[fieldId];
    rows.push({
      fieldId,
      question: field
        ? plainText(field.labelHtml) || `${unknownQuestionLabel} ${fieldId}`
        : `${unknownQuestionLabel} ${fieldId}`,
      answer: formatAnswer(field, tag[2], tag[3], noAnswerLabel),
    });
  }

  return rows;
}

type Props = {
  open: boolean;
  attachment: IFormAttachment | null;
  index?: number;
  total?: number;
  onClose: () => void;
  onSubmitted: (response: NostrEvent | null) => void;
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
  const submitFnRef = useRef<(() => void) | null>(null);
  const { user } = useUser();
  const { status, markSubmitted } = useFormSubmissionStatus(
    open ? attachment?.naddr : undefined,
    open ? user?.pubkey : undefined,
  );
  const alreadySubmitted = status.state === "submitted";
  const [resubmitting, setResubmitting] = useState(false);

  const [form, setForm] = useState<SdkForm | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const responseRows = useMemo(() => {
    if (status.state !== "submitted" || !status.event) return [];
    return responseRowsFromEvent(
      status.event,
      form,
      intl.formatMessage({ id: "form.noAnswer" }),
      intl.formatMessage({ id: "form.unknownQuestion" }),
    );
  }, [status, form, intl]);

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
      const fetched = await fetchAttachedFormCached<SdkForm>(attachment);
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

  // Fetch the form template whenever we need to render either the editable
  // SDK form or a read-only summary of the user's previous response.
  useEffect(() => {
    const shouldRender =
      open &&
      attachment &&
      (status.state === "not-submitted" ||
        status.state === "error" ||
        status.state === "submitted" ||
        resubmitting);
    if (shouldRender) fetchForm();
    if (!open) {
      setForm(null);
      setFetchError(null);
      setSubmitError(null);
      sdkRef.current = null;
      submitFnRef.current = null;
      setResubmitting(false);
    }
  }, [open, attachment, fetchForm, status.state, resubmitting]);

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
        markSubmitted(event);
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
  }, [form, intl, onSubmitted, markSubmitted]);

  const showForm =
    !loading && !fetchError && form && !(alreadySubmitted && !resubmitting);

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
        {(status.state === "loading" || loading) && (
          <Box display="flex" justifyContent="center" py={6}>
            <CircularProgress />
          </Box>
        )}

        {alreadySubmitted && !resubmitting && !loading && (
          <Stack spacing={2}>
            <Alert
              icon={<CheckCircleIcon fontSize="inherit" />}
              severity="success"
            >
              {intl.formatMessage({ id: "form.alreadySubmitted" })}
            </Alert>
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                onClick={() => {
                  if (status.state === "submitted") {
                    onSubmitted(status.event ?? null);
                  } else {
                    onClose();
                  }
                }}
              >
                {intl.formatMessage({ id: "form.continue" })}
              </Button>
              <Button variant="outlined" onClick={() => setResubmitting(true)}>
                {intl.formatMessage({ id: "form.submitAgain" })}
              </Button>
            </Stack>

            {status.state === "submitted" &&
              status.event &&
              responseRows.length > 0 && (
                <Box
                  sx={{
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: 1,
                    overflow: "hidden",
                    width: "100%",
                  }}
                >
                  <Box
                    sx={{
                      px: 1.5,
                      py: 1,
                      borderBottom: `1px solid ${theme.palette.divider}`,
                      bgcolor: "action.hover",
                    }}
                  >
                    <Typography variant="subtitle2">
                      {intl.formatMessage({ id: "form.yourResponse" })}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {dayjs(status.submittedAt).format("YYYY-MM-DD HH:mm")}
                    </Typography>
                  </Box>
                  <Stack spacing={0}>
                    {responseRows.map((row, rowIndex) => (
                      <Box
                        key={`${row.fieldId}-${rowIndex}`}
                        sx={{
                          px: 1.5,
                          py: 1.25,
                          borderTop:
                            rowIndex === 0
                              ? "none"
                              : `1px solid ${theme.palette.divider}`,
                        }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          {row.question}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ whiteSpace: "pre-wrap" }}
                        >
                          {row.answer}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              )}

            {status.state === "submitted" &&
              (!status.event || responseRows.length === 0) && (
                <Typography variant="body2" color="text.secondary">
                  {intl.formatMessage({ id: "form.responseUnavailable" })}
                </Typography>
              )}
          </Stack>
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
            {attachment && (
              <Button
                variant="text"
                href={buildFormstrUrl(attachment)}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ alignSelf: "flex-start" }}
              >
                {intl.formatMessage({ id: "form.openExternal" })}
              </Button>
            )}
          </Stack>
        )}

        {showForm && (
          <>
            {submitError && (
              <Alert severity="error" sx={{ mb: 2.5 }}>
                {submitError}
              </Alert>
            )}
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
        {attachment ? (
          <Button
            size="small"
            endIcon={<OpenInNewIcon fontSize="inherit" />}
            href={buildFormstrUrl(attachment)}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              textTransform: "none",
              color: "text.secondary",
              flexShrink: 0,
            }}
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

function buildFormSx(theme: Theme) {
  return {
    "& form": {
      display: "flex",
      flexDirection: "column",
      gap: "20px",
      padding: 0,
      margin: 0,
    },
    "& form h2": { display: "none" },
    "& form button[type='submit']": { display: "none" },
    "& form > div": {
      fontSize: "0.875rem",
      color: theme.palette.text.secondary,
      lineHeight: 1.6,
    },
    "& form > label": {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      fontSize: "0.875rem",
      fontWeight: 500,
      color: theme.palette.text.secondary,
      cursor: "default",
    },
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
