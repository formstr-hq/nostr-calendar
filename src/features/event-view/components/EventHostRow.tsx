import { Typography } from "@mui/material";
import { FormattedMessage } from "react-intl";
import { Participant } from "../../../components/Participant";

/**
 * Always-visible "Hosted by X" row (mockups 12/20/21). No Message action —
 * the app has no DM/messaging feature to wire it to (deviation, confirmed
 * out of scope this session).
 */
export function EventHostRow({ hostPubkey }: { hostPubkey: string }) {
  return (
    <Typography
      component="div"
      variant="body1"
      sx={{ display: "flex", gap: "4px", alignItems: "center" }}
    >
      <FormattedMessage
        id="event.hostedBy"
        values={{
          participant: <Participant pubKey={hostPubkey} isAuthor={false} />,
        }}
      />
    </Typography>
  );
}
