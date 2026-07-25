import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import {
  Alert,
  Box,
  CircularProgress,
  Snackbar,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useIntl } from "react-intl";
import { useSchedulingPages } from "../../stores/schedulingPages";
import { ROUTES, getSchedulingPageEditUrl } from "../../utils/routingHelper";
import { useSchedulingPageForm } from "./hooks/useSchedulingPageForm";
import { useSchedulingPageSave } from "./hooks/useSchedulingPageSave";
import { BookingEditDesktopForm } from "./components/BookingEditDesktopForm";
import { BookingEditMobileForm } from "./components/BookingEditMobileForm";

export function BookingEditor() {
  const { naddr } = useParams<{ naddr: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const intl = useIntl();

  const { pages, isLoaded, getNAddr, fetchPages } = useSchedulingPages();

  const isEditMode = !!naddr;

  const existingPage = useMemo(() => {
    if (!naddr || !isLoaded) return null;
    return pages.find((p) => getNAddr(p) === naddr) || null;
  }, [naddr, isLoaded, pages, getNAddr]);

  useEffect(() => {
    if (!isLoaded) {
      fetchPages();
    }
  }, [isLoaded, fetchPages]);

  const form = useSchedulingPageForm(existingPage);
  const save = useSchedulingPageSave({
    isEditMode,
    existingPage,
    form,
    onCreated: (createdNaddr) =>
      navigate(getSchedulingPageEditUrl(createdNaddr), { replace: true }),
  });

  const canSave =
    !save.processing &&
    form.formData.title.trim() !== "" &&
    form.hasAvailability &&
    form.formData.slotDurations.length > 0;

  const onBack = () => navigate(ROUTES.Bookings);

  if (isEditMode && !isLoaded) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "50vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (isEditMode && isLoaded && !existingPage) {
    return (
      <Box sx={{ p: 3, maxWidth: 800, mx: "auto" }}>
        <Alert severity="error">
          {intl.formatMessage({ id: "scheduling.pageNotFound" })}
        </Alert>
      </Box>
    );
  }

  return (
    <>
      {isMobile ? (
        <BookingEditMobileForm
          isEditMode={isEditMode}
          form={form}
          save={save}
          canSave={canSave}
          onBack={onBack}
        />
      ) : (
        <BookingEditDesktopForm
          isEditMode={isEditMode}
          form={form}
          save={save}
          canSave={canSave}
          onBack={onBack}
        />
      )}

      <Snackbar
        open={save.snackbar.open}
        autoHideDuration={4000}
        onClose={() => save.setSnackbar((s) => ({ ...s, open: false }))}
      >
        <Alert
          severity={save.snackbar.severity}
          onClose={() => save.setSnackbar((s) => ({ ...s, open: false }))}
        >
          {save.snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}

export default BookingEditor;
