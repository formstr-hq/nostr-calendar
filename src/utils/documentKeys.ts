// Pages' src/utils/nkeys.ts uses this same bech32 TLV codec (0=name, 1=value).
// Reuse the installed Formstr implementation, as formLink.ts already does.
export { encodeNKeys, decodeNKeys } from "@formstr/sdk/dist/utils/nkeys.js";
