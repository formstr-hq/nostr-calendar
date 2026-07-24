import { Box, Typography } from "@mui/material";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import { useIntl } from "react-intl";
import { radius } from "../../../theme/tokens";

/**
 * Location card (mockups 12/20/21) — deviation: string only, no map
 * thumbnail/geocoding. "Directions" is a plain maps search link built
 * from the location text, not a resolved address.
 */
export function EventLocationCard({ location }: { location: string }) {
  const intl = useIntl();
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        p: 1.5,
        borderRadius: `${radius.card}px`,
        bgcolor: "action.hover",
      }}
    >
      <LocationOnIcon color="action" />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          variant="body1"
          fontWeight={600}
          sx={{ overflowWrap: "anywhere" }}
        >
          {location}
        </Typography>
        <Typography
          component="a"
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          variant="body2"
          sx={{ color: "primary.main", textDecoration: "none" }}
        >
          {intl.formatMessage({ id: "event.directions" })} →
        </Typography>
      </Box>
    </Box>
  );
}
