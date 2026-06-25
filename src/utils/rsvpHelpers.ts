import { RSVPStatus } from "../utils/types";

export const getRSVPStatusColor = (status: RSVPStatus) => {
  switch (status) {
    case RSVPStatus.accepted:
      return { backgroundColor: "#4CAF50", color: "white" };
    case RSVPStatus.declined:
      return { backgroundColor: "#f44336", color: "white" };
    case RSVPStatus.tentative:
      return { backgroundColor: "#FF9800", color: "white" };
    default:
      return { backgroundColor: "#e0e0e0", color: "#666" };
  }
};

export const getRSVPButtonStyle = (
  status: RSVPStatus,
  isSelected: boolean,
  isUpdatingRSVP: boolean,
  styles: any,
) => {
  const baseStyle = {
    ...styles.rsvpButton,
    opacity: isUpdatingRSVP ? 0.5 : 1,
  };

  if (isSelected) {
    switch (status) {
      case RSVPStatus.accepted:
        return {
          ...baseStyle,
          backgroundColor: "#4CAF50",
          color: "white",
          borderColor: "#4CAF50",
        };
      case RSVPStatus.declined:
        return {
          ...baseStyle,
          backgroundColor: "#f44336",
          color: "white",
          borderColor: "#f44336",
        };
      case RSVPStatus.tentative:
        return {
          ...baseStyle,
          backgroundColor: "#FF9800",
          color: "white",
          borderColor: "#FF9800",
        };
    }
  }

  return baseStyle;
};
