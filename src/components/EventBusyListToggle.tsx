import {
  Alert,
  Box,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import EventBusyIcon from "@mui/icons-material/EventBusy";
import { useEffect, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import { useBusyList } from "../stores/busyList";
import { useUser } from "../stores/user";
import {
  canManageEventBusyList,
  getBusyRangeForEvent,
  isExactBusyRangeInLists,
} from "../utils/busyList";
import { busyListMonthKeysForRange } from "../utils/dateHelper";
import type { ICalendarEvent } from "../utils/types";

interface EventBusyListToggleProps {
  event: ICalendarEvent;
}

export function EventBusyListToggle({ event }: EventBusyListToggleProps) {
  const intl = useIntl();
  const { user } = useUser();
  const ownLists = useBusyList((state) => state.ownLists);
  const loadOwnLists = useBusyList((state) => state.loadOwnLists);
  const addBusyRange = useBusyList((state) => state.addBusyRange);
  const removeBusyRange = useBusyList((state) => state.removeBusyRange);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [errorOpen, setErrorOpen] = useState(false);

  const busyRange = useMemo(
    () => getBusyRangeForEvent({ begin: event.begin, end: event.end }),
    [event.begin, event.end],
  );
  const busyRangeStart = busyRange?.start;
  const busyRangeEnd = busyRange?.end;
  const monthKeys = useMemo(
    () =>
      busyRangeStart !== undefined && busyRangeEnd !== undefined
        ? busyListMonthKeysForRange(busyRangeStart, busyRangeEnd)
        : [],
    [busyRangeStart, busyRangeEnd],
  );
  const canManage = canManageEventBusyList(event, user?.pubkey);
  const isBusy = busyRange
    ? isExactBusyRangeInLists(ownLists, busyRange)
    : false;

  useEffect(() => {
    let mounted = true;

    if (
      !canManage ||
      busyRangeStart === undefined ||
      busyRangeEnd === undefined ||
      monthKeys.length === 0
    ) {
      return () => {
        mounted = false;
      };
    }

    setLoading(true);
    loadOwnLists(monthKeys)
      .catch((error) => {
        console.error("Failed to load busy lists:", error);
        if (mounted) {
          setErrorOpen(true);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [busyRangeEnd, busyRangeStart, canManage, loadOwnLists, monthKeys]);

  if (!canManage || !busyRange) {
    return null;
  }

  const handleToggle = async (checked: boolean) => {
    setUpdating(true);
    try {
      if (checked) {
        await addBusyRange(busyRange);
      } else {
        await removeBusyRange(busyRange);
      }
    } catch (error) {
      console.error("Failed to update busy list:", error);
      setErrorOpen(true);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <>
      <Box sx={{ backgroundColor: "action.hover", borderRadius: 1, p: 1.5 }}>
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <EventBusyIcon color="action" fontSize="small" sx={{ mt: 0.75 }} />
          <Box flex={1} minWidth={0}>
            <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
              <FormControlLabel
                sx={{ m: 0 }}
                control={
                  <Checkbox
                    checked={isBusy}
                    disabled={loading || updating}
                    onChange={(changeEvent) => {
                      void handleToggle(changeEvent.target.checked);
                    }}
                    size="small"
                  />
                }
                label={
                  <Typography variant="body2">
                    {intl.formatMessage({ id: "busyList.eventToggle" })}
                  </Typography>
                }
              />
              {(loading || updating) && (
                <CircularProgress size={16} color="inherit" />
              )}
            </Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mt: 0.5 }}
            >
              {intl.formatMessage({ id: "busyList.eventHelperText" })}
            </Typography>
          </Box>
        </Stack>
      </Box>

      <Snackbar
        open={errorOpen}
        autoHideDuration={4000}
        onClose={() => setErrorOpen(false)}
      >
        <Alert severity="error" onClose={() => setErrorOpen(false)}>
          {intl.formatMessage({ id: "busyList.updateError" })}
        </Alert>
      </Snackbar>
    </>
  );
}
