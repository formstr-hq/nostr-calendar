import { create } from "zustand";
import { getItem, setItem } from "../common/localStorage";
import { isMobile } from "../common/utils";
import { AccentPresetName, defaultAccent } from "../theme/tokens";

export type ThemeMode = "light" | "dark" | "system";

export interface ISettings {
  layout: "day" | "week" | "month";
  filters: {
    showPublicEvents: boolean;
  };
  themeMode: ThemeMode;
  accent: AccentPresetName | string;
}

const localStorageKey = "cal:settings";

const defaultSettings: ISettings = {
  layout: "week",
  filters: {
    showPublicEvents: false,
  },
  themeMode: "system",
  accent: defaultAccent,
};

// Spread over defaults so users with settings saved before themeMode/accent
// existed don't end up with undefined values.
const previousSettings: ISettings = {
  ...defaultSettings,
  ...getItem<Partial<ISettings>>(localStorageKey, {}),
};
if (isMobile) {
  previousSettings.layout = "day";
}

export const useSettings = create<{
  settings: ISettings;
  updateSetting: <T extends keyof ISettings>(
    setting: T,
    value: ISettings[T],
  ) => void;
  updateFilters: <T extends keyof ISettings["filters"]>(
    setting: T,
    value: ISettings["filters"][T],
  ) => void;
}>((set) => ({
  settings: previousSettings,
  updateSetting: (setting, value) =>
    set(({ settings }) => {
      const newSettings = { ...settings, [setting]: value };
      setItem(localStorageKey, newSettings);
      return { settings: newSettings };
    }),
  updateFilters: (filter, value) =>
    set(({ settings }) => {
      const newSettings = {
        ...settings,
        filters: { ...settings.filters, [filter]: value },
      };
      setItem(localStorageKey, newSettings);
      return { settings: newSettings };
    }),
}));
