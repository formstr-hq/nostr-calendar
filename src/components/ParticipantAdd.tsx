import {
  Box,
  CircularProgress,
  Paper,
  Popper,
  TextField,
  Typography,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { useIntl } from "react-intl";
import { useParticipantSearch } from "../features/event-editor/hooks/useParticipantSearch";
import { useParticipantHistory } from "../stores/participantHistory";
import { useUser } from "../stores/user";
import { radius, shadow, spacing } from "../theme/tokens";
import { ParticipantSearchOption } from "./ParticipantSearchOption";

const ResultsPaper = styled(Paper)(({ theme }) => ({
  width: "var(--participant-picker-width)",
  maxHeight: spacing * 36,
  overflow: "hidden",
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: radius.popover,
  boxShadow: shadow.popover,
}));

const ResultsListbox = styled("div")({
  display: "flex",
  flexDirection: "column",
  maxHeight: spacing * 36,
});

const SelectableOptions = styled("div")({
  minHeight: 0,
  overflowY: "auto",
});

const SelectedOptions = styled("div")(({ theme }) => ({
  flexShrink: 0,
  maxHeight: spacing * 14,
  overflowY: "auto",
  borderTop: `1px solid ${theme.palette.divider}`,
  backgroundColor:
    theme.vars?.palette.background.paper ?? theme.palette.background.paper,
}));

const EmptyStatus = styled(Typography)({
  padding: `${spacing * 1.5}px ${spacing * 2}px`,
});

export const ParticipantAdd = ({
  onAdd,
  participants = [],
}: {
  onAdd: (pubKey: string) => void;
  participants?: string[];
}) => {
  const intl = useIntl();
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const currentPubkey = useUser((state) => state.user?.pubkey);
  const historyByPubkey = useParticipantHistory((state) => state.participants);
  const historyAccount = useParticipantHistory((state) => state.accountPubkey);
  const updateProfileSnapshot = useParticipantHistory(
    (state) => state.updateProfileSnapshot,
  );
  const history = useMemo(
    () =>
      Object.values(historyByPubkey)
        .sort((a, b) => b.firstInteractionAt - a.firstInteractionAt)
        .map((person) => ({
          pubkey: person.participantPubkey,
          name: person.name,
          displayName: person.displayName,
          picture: person.picture,
          nip05: person.nip05,
        })),
    [historyByPubkey],
  );
  const { options, loading, error } = useParticipantSearch({
    query,
    selectedParticipants: participants,
    currentPubkey,
    history,
    onProfileResolved: (profile) => {
      updateProfileSnapshot(historyAccount, profile.pubkey, {
        name: profile.name,
        displayName: profile.displayName,
        picture: profile.picture,
        nip05: profile.nip05,
        profileCreatedAt: profile.createdAt,
      });
    },
  });

  useEffect(
    () => setActiveIndex(options.findIndex((option) => !option.isSelected)),
    [options],
  );

  const selectOption = (index: number) => {
    const option = options[index];
    if (!option || option.isSelected) return;
    onAdd(option.pubkey);
    setQuery("");
    setFocused(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const enabledIndexes = options.flatMap((option, index) =>
      option.isSelected ? [] : [index],
    );
    const enabledPosition = enabledIndexes.indexOf(activeIndex);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setFocused(true);
      setActiveIndex(
        enabledIndexes[
          Math.min(enabledPosition + 1, enabledIndexes.length - 1)
        ] ?? -1,
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(enabledIndexes[Math.max(enabledPosition - 1, 0)] ?? -1);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      selectOption(activeIndex);
    } else if (event.key === "Escape") {
      setFocused(false);
    }
  };

  const listboxId = "participant-search-results";
  const open = focused;
  const status = loading
    ? intl.formatMessage({ id: "participant.searching" })
    : query.trim()
      ? intl.formatMessage({ id: "participant.noResults" })
      : intl.formatMessage({ id: "participant.noHistory" });
  const indexedOptions = options.map((option, index) => ({ option, index }));
  const selectableOptions = indexedOptions.filter(
    ({ option }) => !option.isSelected,
  );
  const selectedOptions = indexedOptions.filter(
    ({ option }) => option.isSelected,
  );
  const renderOption = ({ option, index }: (typeof indexedOptions)[number]) => (
    <ParticipantSearchOption
      key={option.pubkey}
      option={option}
      listboxId={listboxId}
      selected={!option.isSelected && index === activeIndex}
      onActivate={() => setActiveIndex(index)}
      onSelect={() => selectOption(index)}
    />
  );

  return (
    <Box ref={anchorRef}>
      <TextField
        fullWidth
        size="small"
        inputRef={inputRef}
        error={!!error}
        helperText={
          error ? intl.formatMessage({ id: "participant.invalid" }) : undefined
        }
        placeholder={intl.formatMessage({ id: "navigation.addParticipants" })}
        value={query}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
        onChange={(event) => {
          setQuery(event.target.value);
          setFocused(true);
        }}
        slotProps={{
          htmlInput: {
            role: "combobox",
            "aria-autocomplete": "list",
            "aria-expanded": open,
            "aria-controls": open ? listboxId : undefined,
            "aria-activedescendant":
              open && options[activeIndex] && !options[activeIndex].isSelected
                ? `${listboxId}-${options[activeIndex].pubkey}`
                : undefined,
          },
          input: {
            endAdornment: loading ? <CircularProgress size={18} /> : undefined,
          },
        }}
      />
      <Popper
        open={open}
        anchorEl={anchorRef.current}
        placement="bottom-start"
        sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
      >
        <ResultsPaper
          elevation={0}
          style={
            {
              "--participant-picker-width": `${anchorRef.current?.clientWidth ?? spacing * 40}px`,
            } as CSSProperties
          }
        >
          {options.length > 0 ? (
            <ResultsListbox id={listboxId} role="listbox">
              {selectableOptions.length > 0 && (
                <SelectableOptions>
                  {selectableOptions.map(renderOption)}
                </SelectableOptions>
              )}
              {selectedOptions.length > 0 && (
                <SelectedOptions>
                  {selectedOptions.map(renderOption)}
                </SelectedOptions>
              )}
            </ResultsListbox>
          ) : (
            <EmptyStatus role="status" variant="body2" color="text.secondary">
              {status}
            </EmptyStatus>
          )}
        </ResultsPaper>
      </Popper>
    </Box>
  );
};
