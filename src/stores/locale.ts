import { Locale } from "date-fns";
import { create } from "zustand";
import dictionary from "../common/dictionary";
import { getItem } from "../common/localStorage";

export interface ILocaleState {
  locale: string;
  localeDateFns: Locale | null;
  updateLocale: (locale: ILocaleState["locale"]) => void;
}

let _locale =
  getItem<string | null>("locale", null) ||
  (navigator.languages && navigator.languages[0]) ||
  navigator.language ||
  "en-US";
_locale = ~Object.keys(dictionary).indexOf(_locale) ? _locale : "en-US";

export const useLocale = create<ILocaleState>((set) => ({
  locale: _locale,
  localeDateFns: null,
  updateLocale: (locale) => {
    set({ locale });
  },
}));
