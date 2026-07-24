import { create } from "zustand";
import { getItem, setItem } from "../common/localStorage";
import { AccentPresetName, defaultAccent } from "../theme/tokens";
import {
  fetchGeneralSettings,
  publishGeneralSettings,
} from "../nostr/settings";

export type ThemeMode = "light" | "dark" | "system";
export type WeekStart = "monday" | "sunday" | "saturday";
export type TimeFormat = "12h" | "24h";
export type DefaultDuration = 25 | 30 | 55 | 60;

export interface GeneralSettings {
  weekStart: WeekStart;
  timeFormat: TimeFormat;
  defaultCalendarId: string;
  defaultDuration: DefaultDuration;
  defaultReminderMinutes: number;
  workingHours: {
    start: string;
    end: string;
  };
}

export interface ISettings {
  layout: "day" | "week" | "month";
  filters: {
    showPublicEvents: boolean;
  };
  themeMode: ThemeMode;
  accent: AccentPresetName | string;
  general: GeneralSettings;
}

const localStorageKey = "cal:settings";

const defaultSettings: ISettings = {
  layout: "week",
  filters: {
    showPublicEvents: false,
  },
  themeMode: "system",
  accent: defaultAccent,
  general: {
    weekStart: "monday",
    timeFormat: "24h",
    defaultCalendarId: "",
    defaultDuration: 30,
    defaultReminderMinutes: 10,
    workingHours: {
      start: "09:00",
      end: "18:00",
    },
  },
};

// Spread over defaults so users with settings saved before themeMode/accent
// existed don't end up with undefined values.
const storedSettings = getItem<Partial<ISettings>>(localStorageKey, {});
const previousSettings: ISettings = {
  ...defaultSettings,
  ...storedSettings,
  general: {
    ...defaultSettings.general,
    ...storedSettings.general,
    workingHours: {
      ...defaultSettings.general.workingHours,
      ...storedSettings.general?.workingHours,
    },
  },
};

let lastRemoteCreatedAt = 0;
let publishQueue = Promise.resolve();
let localGeneralRevision = 0;

const persist = (settings: ISettings) => setItem(localStorageKey, settings);

function queueGeneralSettingsPublish(settings: GeneralSettings) {
  publishQueue = publishQueue
    .then(() => publishGeneralSettings(settings, lastRemoteCreatedAt))
    .then((event) => {
      lastRemoteCreatedAt = event.created_at;
    })
    .catch((error) => {
      console.warn("Failed to sync general settings", error);
    });
}

export const useSettings = create<{
  settings: ISettings;
  isGeneralSettingsSynced: boolean;
  updateSetting: <T extends keyof ISettings>(
    setting: T,
    value: ISettings[T],
  ) => void;
  updateFilters: <T extends keyof ISettings["filters"]>(
    setting: T,
    value: ISettings["filters"][T],
  ) => void;
  updateGeneralSetting: <T extends keyof GeneralSettings>(
    setting: T,
    value: GeneralSettings[T],
  ) => void;
  syncGeneralSettings: (pubkey: string) => Promise<void>;
}>((set) => ({
  settings: previousSettings,
  isGeneralSettingsSynced: false,
  updateSetting: (setting, value) =>
    set(({ settings }) => {
      const newSettings = { ...settings, [setting]: value };
      persist(newSettings);
      return { settings: newSettings };
    }),
  updateFilters: (filter, value) =>
    set(({ settings }) => {
      const newSettings = {
        ...settings,
        filters: { ...settings.filters, [filter]: value },
      };
      persist(newSettings);
      return { settings: newSettings };
    }),
  updateGeneralSetting: (setting, value) =>
    set(({ settings }) => {
      localGeneralRevision += 1;
      const newSettings = {
        ...settings,
        general: { ...settings.general, [setting]: value },
      };
      persist(newSettings);
      queueGeneralSettingsPublish(newSettings.general);
      return { settings: newSettings };
    }),
  syncGeneralSettings: async (pubkey) => {
    const revisionAtStart = localGeneralRevision;
    try {
      const remote = await fetchGeneralSettings(pubkey);
      if (!remote) {
        lastRemoteCreatedAt = 0;
        if (localGeneralRevision !== revisionAtStart) {
          set({ isGeneralSettingsSynced: true });
          return;
        }
        set(({ settings }) => {
          const reset = {
            ...settings,
            general: defaultSettings.general,
          };
          persist(reset);
          return { settings: reset, isGeneralSettingsSynced: true };
        });
        return;
      }
      lastRemoteCreatedAt = remote.event.created_at;
      if (localGeneralRevision !== revisionAtStart) {
        set({ isGeneralSettingsSynced: true });
        return;
      }
      set(({ settings }) => {
        const merged: ISettings = {
          ...settings,
          general: {
            ...defaultSettings.general,
            ...remote.settings,
            workingHours: {
              ...defaultSettings.general.workingHours,
              ...remote.settings.workingHours,
            },
          },
        };
        persist(merged);
        return { settings: merged, isGeneralSettingsSynced: true };
      });
    } catch (error) {
      console.warn("Failed to load general settings", error);
      set({ isGeneralSettingsSynced: true });
    }
  },
}));

export { defaultSettings };
