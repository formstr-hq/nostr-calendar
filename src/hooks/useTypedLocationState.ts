import { useLocation } from "react-router";

export function useTypedLocationState<LocationState>() {
  const { state } = useLocation();
  if (!state) {
    return null;
  } else {
    return state as LocationState;
  }
}
