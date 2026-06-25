import { create } from "zustand";
import { getItem, setItem } from "../common/localStorage";
import { isMobile } from "../common/utils";

export interface ISettings {
  layout: "day" | "week" | "month";
  filters: {
    showPublicEvents: boolean;
  };
}

const localStorageKey = "cal:settings";

const previousSettings = getItem<ISettings>(localStorageKey, {
  layout: "week",
  filters: {
    showPublicEvents: false,
  },
});
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
