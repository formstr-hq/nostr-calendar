export const PX_PER_MINUTE = 1;

export const ANONYMOUS_USER_NAME = "Anon...";

export const DEFAULT_IMAGE_URL =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Anonymous.svg/200px-Anonymous.svg.png";

export const USER_DATA_TTL_HOURS = 168; // 7 days

// Secure storage keys for the background invitation worker
export const BG_KEY_USER_PUBKEY = "bg:userPubkey";
export const BG_KEY_RELAYS = "bg:relays";
export const BG_KEY_LAST_LOGIN_TIME = "bg:lastLoginTime";
export const BG_KEY_LAST_INVITATION_FETCH_TIME = "bg:lastInvitationFetchTime";
export const BG_KEY_LAST_BOOKING_REQUEST_FETCH_TIME =
  "bg:lastBookingRequestFetchTime";
export const BG_KEY_LAST_BOOKING_RESPONSE_FETCH_TIME =
  "bg:lastBookingResponseFetchTime";
