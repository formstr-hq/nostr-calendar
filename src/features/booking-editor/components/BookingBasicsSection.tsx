import { Box, TextField } from "@mui/material";
import { useIntl } from "react-intl";

interface BookingBasicsFormData {
  title: string;
  eventTitle: string;
  description: string;
  location: string;
  image: string;
}

interface BookingBasicsSectionProps {
  formData: BookingBasicsFormData;
  updateField: (field: keyof BookingBasicsFormData, value: string) => void;
  /** Desktop shows the title inline with the rest of Basics; mobile renders
   * title separately above this section, so it's omitted here. */
  showTitle?: boolean;
}

export function BookingBasicsSection({
  formData,
  updateField,
  showTitle = true,
}: BookingBasicsSectionProps) {
  const intl = useIntl();
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {showTitle && (
        <TextField
          fullWidth
          label="Title"
          placeholder="e.g., Schedule a meeting with me"
          value={formData.title}
          onChange={(e) => updateField("title", e.target.value)}
          required
          size="small"
        />
      )}
      <TextField
        fullWidth
        label={intl.formatMessage({ id: "scheduling.eventTitle" })}
        placeholder={intl.formatMessage({
          id: "scheduling.eventTitlePlaceholder",
        })}
        value={formData.eventTitle}
        onChange={(e) => updateField("eventTitle", e.target.value)}
        size="small"
        helperText={intl.formatMessage({ id: "scheduling.eventTitleHelp" })}
      />
      <TextField
        fullWidth
        label="Description"
        placeholder="Booking instructions or details..."
        value={formData.description}
        onChange={(e) => updateField("description", e.target.value)}
        multiline
        rows={3}
        size="small"
      />
      <TextField
        fullWidth
        label="Location"
        placeholder="e.g., Google Meet, Zoom, In person"
        value={formData.location}
        onChange={(e) => updateField("location", e.target.value)}
        size="small"
      />
      <TextField
        fullWidth
        label="Image URL"
        placeholder="https://example.com/image.jpg"
        value={formData.image}
        onChange={(e) => updateField("image", e.target.value)}
        size="small"
      />
    </Box>
  );
}
