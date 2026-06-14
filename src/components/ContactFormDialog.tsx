import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Snackbar,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import { FormsSigner, FormstrSDK, NormalizedForm } from "@formstr/sdk";
import { nip19 } from "nostr-tools";
import { useIntl } from "react-intl";
import { useUser } from "../stores/user";
import { signerManager } from "../common/signer";
import { fetchAttachedFormCached } from "../utils/formAttachment";
import type { IFormAttachment } from "../utils/types";

const CONTACT_FORM: IFormAttachment = {
  naddr:
    "naddr1qvzqqqr4mqpzphj4jjc6qkaaswuz6wu3kzyvhhdu5e68rdfymj2dtmk5eajwvx2mqy2hwumn8ghj7un9d3shjtnyv9kh2uewd9hj7qghwaehxw309aex2mrp0yh8qunfd4skctnwv46z7qgwwaehxw309ahx7uewd3hkctcpzamhxue69uhhyetvv9ujumn0wd68ytnzv9hxgtcpzemhxue69uhkummnw3ex2mrfw3jhxtn0wfnj7qgkwaehxw309amk7apwdehhxarj9ecxzun50yhsz9nhwden5te0wfjkccte9ekk7um5wgh8qatz9uq3xamnwvaz7tm0venxx6rpd9hzuur4vghszxrhwden5te0wfjkccte9ecxcetzwd68ytnrdakj7qgkwaehxw309aex2mrp0yhxsmrvduhxc6tkv5hszrthwden5te0dehhxtnvdakqz8nhwden5te0wfjkccte9ehx7um5wgh8w6tjv4jxuet59e48qtcpr3mhxue69uhkummnw3ez6vp39eukz6mfdphkumn99e3k7mgprpmhxue69uhhyetvv9ujuumwdae8gtnnda3kjctvqyt8wumn8ghj7un9d3shjtnwdaehgu3wvfskueqpz9mhxue69uhkummnw3eryvfwvdhk6qqxfd2kkanzfy0mfdms",
  viewKey: "4425edf8b0c0ab84f47718452c6dd0fcfb6df2ec73ad868b31eefe0f18abc8f8",
};

type SdkForm = NormalizedForm;
type SdkField = { labelHtml?: string; type?: string };

function plainText(html: string | undefined): string {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || div.innerText || "").trim();
}

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ContactFormDialog({ open, onClose }: Props) {
  const intl = useIntl();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sdkRef = useRef<FormstrSDK | null>(null);
  const { user } = useUser();

  const [form, setForm] = useState<SdkForm | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showThankYou, setShowThankYou] = useState(false);

  const fetchForm = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    setSubmitError(null);
    setForm(null);
    try {
      const sdk = new FormstrSDK();
      sdkRef.current = sdk;
      const fetched = await fetchAttachedFormCached<SdkForm>(CONTACT_FORM);
      sdk.renderHtml(fetched as never);
      setForm(fetched);
    } catch (err) {
      setFetchError(
        err instanceof Error
          ? err.message
          : intl.formatMessage({ id: "form.fetchError" }),
      );
    } finally {
      setLoading(false);
    }
  }, [intl]);

  useEffect(() => {
    if (open) {
      fetchForm();
    } else {
      setForm(null);
      setFetchError(null);
      setSubmitError(null);
      sdkRef.current = null;
    }
  }, [open, fetchForm]);

  // Extracted so it can be called on initial render and after submit error
  // (the SDK resets the form DOM when collecting values for signing)
  const applyPrefill = useCallback(() => {
    if (!form || !containerRef.current || !user?.pubkey) return;
    const fields = (form.fields ?? {}) as Record<string, SdkField>;
    const contactFieldId = Object.entries(fields).find(([, field]) =>
      plainText(field.labelHtml).toLowerCase().includes("email or npub"),
    )?.[0];
    if (!contactFieldId) return;
    const input = containerRef.current.querySelector<HTMLInputElement>(
      `[name="${contactFieldId}"], [id="${contactFieldId}"]`,
    );
    if (input) {
      input.value = nip19.npubEncode(user.pubkey);
    }
  }, [form, user]);

  // Prefill after initial form render
  useEffect(() => {
    applyPrefill();
  }, [applyPrefill]);

  const submitForm = () => {
    if (!form || !sdkRef.current || !containerRef.current) return;
    const sdk = sdkRef.current;
    const root = containerRef.current;
    const formEl = root.querySelector("form");
    if (!formEl) return;

    const onSubmitDom = (e: SubmitEvent) => {
      e.preventDefault();
      setSubmitting(true);
      setSubmitError(null);
    };
    formEl.addEventListener("submit", onSubmitDom);

    signerManager.getSigner().then((signer) => {
      const formsSigner: FormsSigner = {
        signEvent: signer.signEvent,
        getPublicKey: signer.getPublicKey,
        nip44Decrypt: signer.nip44Decrypt!,
        nip44Encrypt: signer.nip44Encrypt!,
      };

      sdk.attachSubmitListener(form as never, formsSigner, {
        onSuccess: () => {
          setSubmitting(false);
          onClose();
          setShowThankYou(true);
        },
        onError: (err) => {
          setSubmitting(false);
          setSubmitError(
            err instanceof Error
              ? err.message
              : intl.formatMessage({ id: "form.submitError" }),
          );
        },
      });
      formEl.requestSubmit();
    });
  };

  // Re-apply prefill after error — SDK reset the form DOM during signing
  const prevSubmittingRef = useRef(false);
  useEffect(() => {
    if (prevSubmittingRef.current && !submitting && submitError) {
      applyPrefill();
    }
    prevSubmittingRef.current = submitting;
  }, [submitting, submitError, applyPrefill]);

  return (
    <>
      <Dialog
        open={open}
        onClose={submitting ? undefined : onClose}
        fullScreen={isMobile}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ pr: 6 }}>
          <Typography variant="h6">
            {intl.formatMessage({ id: "sidebar.contactUs" })}
          </Typography>
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
          {(loading || submitting) && (
            <Box display="flex" justifyContent="center" py={6}>
              <CircularProgress />
            </Box>
          )}

          {fetchError && !loading && (
            <Stack spacing={2}>
              <Typography color="error" variant="body2">
                {fetchError}
              </Typography>
              <Button
                variant="outlined"
                onClick={fetchForm}
                sx={{ alignSelf: "flex-start" }}
              >
                {intl.formatMessage({ id: "form.retry" })}
              </Button>
            </Stack>
          )}

          {submitError && !submitting && (
            <Typography color="error" variant="body2" sx={{ mb: 2 }}>
              {submitError}
            </Typography>
          )}

          {/* Keep the form in the DOM while submitting so the SDK can read values;
              visibility:hidden hides it without unmounting */}
          {form && !loading && !fetchError && (
            <Box
              ref={containerRef}
              sx={{
                ...buildFormSx(theme),
                ...(submitting
                  ? { visibility: "hidden", height: 0, overflow: "hidden" }
                  : {}),
              }}
              dangerouslySetInnerHTML={{ __html: form.html?.form ?? "" }}
            />
          )}
        </DialogContent>

        <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 1.5 }}>
          <Button onClick={onClose} disabled={submitting} color="inherit">
            {intl.formatMessage({ id: "form.cancel" })}
          </Button>
          {form && !loading && !fetchError && (
            <Button
              variant="contained"
              disabled={submitting}
              onClick={submitForm}
            >
              {submitting
                ? intl.formatMessage({ id: "form.submitting" })
                : intl.formatMessage({ id: "form.submit" })}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Snackbar
        open={showThankYou}
        autoHideDuration={5000}
        onClose={() => setShowThankYou(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        message={intl.formatMessage({ id: "sidebar.thankYouMessage" })}
        ContentProps={{
          sx: {
            bgcolor: "#000",
            color: "#fff",
            fontWeight: 500,
            borderRadius: "8px",
          },
        }}
      />
    </>
  );
}

function buildFormSx(theme: Theme) {
  return {
    "& form h2": { display: "none" },
    "& form button[type='submit']": { display: "none" },
    "& .form-body": {
      display: "flex",
      flexDirection: "column",
      gap: "24px",
    },
    "& .form-intro .form-name": { display: "none" },
    "& .form-intro .form-description": {
      fontSize: "0.875rem",
      color: theme.palette.text.secondary,
      lineHeight: 1.7,
    },
    "& .form-section:not(.form-intro)": {
      display: "flex",
      flexDirection: "column",
    },
    "& .form-section > .option-group": {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      marginTop: "22px",
    },
    "& .form-section > .option-group:first-child": {
      marginTop: 0,
    },
    "& .option-group .option-label": {
      fontSize: "0.875rem",
      fontWeight: 700,
      color: theme.palette.text.primary,
      lineHeight: 1.4,
      marginBottom: "4px",
    },
    "& .option-group > label": {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      gap: "8px",
      fontSize: "0.875rem",
      fontWeight: 400,
      color: theme.palette.text.primary,
      cursor: "pointer",
      lineHeight: 1.4,
    },
    "& .form-section > label": {
      fontSize: "0.875rem",
      fontWeight: 700,
      color: theme.palette.text.primary,
      marginTop: "22px",
      marginBottom: "6px",
      cursor: "default",
      lineHeight: 1.4,
    },
    "& .form-section > label:first-child": {
      marginTop: 0,
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
    "& form input[type='radio']": {
      accentColor: theme.palette.primary.main,
      width: "16px",
      height: "16px",
      cursor: "pointer",
      flexShrink: 0,
    },
    "& form fieldset": {
      border: "none",
      padding: 0,
      margin: 0,
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      fontSize: "0.875rem",
      fontWeight: 700,
      color: theme.palette.text.primary,
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
  } as const;
}
