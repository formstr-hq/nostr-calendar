import { FormControlLabel, Switch } from "@mui/material";
import { useSettings } from "../stores/settings";
import { useIntl } from "react-intl";

export const Filters = () => {
  const {
    settings: { filters },
    updateFilters,
  } = useSettings((state) => state);
  const intl = useIntl();

  return (
    <FormControlLabel
      style={{
        margin: 0,
      }}
      control={
        <Switch
          checked={filters?.showPublicEvents}
          onChange={(event) => {
            updateFilters("showPublicEvents", event.target.checked);
          }}
        />
      }
      label={intl.formatMessage({ id: "filters.showPublicEvents" })}
    />
  );
};
