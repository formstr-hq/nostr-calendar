import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Box,
} from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useIntl } from "react-intl";
import type { ReportType } from "../common/nostr";

interface ReportEventDialogProps {
  open: boolean;
  onClose: () => void;
  onReport: (reportType: ReportType) => Promise<void>;
}

const REPORT_TYPES: ReportType[] = [
  "nudity",
  "malware",
  "profanity",
  "illegal",
  "spam",
  "impersonation",
  "other",
];

export function ReportEventDialog({
  open,
  onClose,
  onReport,
}: ReportEventDialogProps) {
  const intl = useIntl();
  const [reportType, setReportType] = useState<ReportType | "">("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reportType) return;
    setSubmitting(true);
    try {
      await onReport(reportType);
    } finally {
      setSubmitting(false);
      setReportType("");
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setReportType("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <WarningAmberIcon color="warning" />
          {intl.formatMessage({ id: "report.title" })}
        </Box>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" mb={2}>
          {intl.formatMessage({ id: "report.description" })}
        </Typography>
        <FormControl fullWidth size="small">
          <InputLabel>{intl.formatMessage({ id: "report.selectType" })}</InputLabel>
          <Select
            value={reportType}
            label={intl.formatMessage({ id: "report.selectType" })}
            onChange={(e) => setReportType(e.target.value as ReportType)}
          >
            {REPORT_TYPES.map((type) => (
              <MenuItem key={type} value={type}>
                {intl.formatMessage({ id: `report.${type}` })}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={submitting} color="inherit">
          {intl.formatMessage({ id: "report.cancel" })}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!reportType || submitting}
          variant="contained"
          color="warning"
        >
          {submitting
            ? intl.formatMessage({ id: "report.submitting" })
            : intl.formatMessage({ id: "report.submit" })}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
