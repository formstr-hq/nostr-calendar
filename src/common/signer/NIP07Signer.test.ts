import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const FAKE_PUBKEY = "a".repeat(64);

const mockNostr = {
  getPublicKey: vi.fn().mockResolvedValue(FAKE_PUBKEY),
  signEvent: vi.fn().mockResolvedValue({ id: "signed-id", sig: "sig" }),
  nip04: {
    encrypt: vi.fn().mockResolvedValue("nip04-encrypted"),
    decrypt: vi.fn().mockResolvedValue("nip04-decrypted"),
  },
  nip44: {
    encrypt: vi.fn().mockResolvedValue("nip44-encrypted"),
    decrypt: vi.fn().mockResolvedValue("nip44-decrypted"),
  },
};

const FAKE_EVENT = {
  kind: 1,
  created_at: 1000000,
  tags: [],
  content: "hello",
};

const PEER_PUBKEY = "b".repeat(64);

describe("NIP07Signer — window.nostr present", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { nostr: mockNostr });
    vi.clearAllMocks();
    // Re-stub mock return values after clearAllMocks
    mockNostr.getPublicKey.mockResolvedValue(FAKE_PUBKEY);
    mockNostr.signEvent.mockResolvedValue({ id: "signed-id", sig: "sig" });
    mockNostr.nip04.encrypt.mockResolvedValue("nip04-encrypted");
    mockNostr.nip04.decrypt.mockResolvedValue("nip04-decrypted");
    mockNostr.nip44.encrypt.mockResolvedValue("nip44-encrypted");
    mockNostr.nip44.decrypt.mockResolvedValue("nip44-decrypted");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getPublicKey delegates to window.nostr.getPublicKey", async () => {
    const { nip07Signer } = await import("./NIP07Signer");
    const pubkey = await nip07Signer.getPublicKey();
    expect(mockNostr.getPublicKey).toHaveBeenCalledTimes(1);
    expect(pubkey).toBe(FAKE_PUBKEY);
  });

  it("signEvent delegates to window.nostr.signEvent", async () => {
    const { nip07Signer } = await import("./NIP07Signer");
    const result = await nip07Signer.signEvent(FAKE_EVENT as any);
    expect(mockNostr.signEvent).toHaveBeenCalledWith(FAKE_EVENT);
    expect(result).toEqual({ id: "signed-id", sig: "sig" });
  });

  it("encrypt delegates to window.nostr.nip04.encrypt", async () => {
    const { nip07Signer } = await import("./NIP07Signer");
    const result = await nip07Signer.encrypt!(PEER_PUBKEY, "plaintext");
    expect(mockNostr.nip04.encrypt).toHaveBeenCalledWith(PEER_PUBKEY, "plaintext");
    expect(result).toBe("nip04-encrypted");
  });

  it("decrypt delegates to window.nostr.nip04.decrypt", async () => {
    const { nip07Signer } = await import("./NIP07Signer");
    const result = await nip07Signer.decrypt!(PEER_PUBKEY, "ciphertext");
    expect(mockNostr.nip04.decrypt).toHaveBeenCalledWith(PEER_PUBKEY, "ciphertext");
    expect(result).toBe("nip04-decrypted");
  });

  it("nip44Encrypt delegates to window.nostr.nip44.encrypt", async () => {
    const { nip07Signer } = await import("./NIP07Signer");
    const result = await nip07Signer.nip44Encrypt!(PEER_PUBKEY, "plaintext");
    expect(mockNostr.nip44.encrypt).toHaveBeenCalledWith(PEER_PUBKEY, "plaintext");
    expect(result).toBe("nip44-encrypted");
  });

  it("nip44Decrypt delegates to window.nostr.nip44.decrypt", async () => {
    const { nip07Signer } = await import("./NIP07Signer");
    const result = await nip07Signer.nip44Decrypt!(PEER_PUBKEY, "ciphertext");
    expect(mockNostr.nip44.decrypt).toHaveBeenCalledWith(PEER_PUBKEY, "ciphertext");
    expect(result).toBe("nip44-decrypted");
  });
});

describe("NIP07Signer — window.nostr absent", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getPublicKey throws NIP-07 signer not found", async () => {
    const { nip07Signer } = await import("./NIP07Signer");
    await expect(nip07Signer.getPublicKey()).rejects.toThrow(
      "NIP-07 signer not found",
    );
  });

  it("signEvent throws NIP-07 signer not found", async () => {
    const { nip07Signer } = await import("./NIP07Signer");
    await expect(nip07Signer.signEvent(FAKE_EVENT as any)).rejects.toThrow(
      "NIP-07 signer not found",
    );
  });

  it("encrypt throws NIP-04 encryption not supported when nip04 missing", async () => {
    const { nip07Signer } = await import("./NIP07Signer");
    await expect(nip07Signer.encrypt!(PEER_PUBKEY, "txt")).rejects.toThrow(
      "NIP-04 encryption not supported",
    );
  });

  it("decrypt throws NIP-04 decryption not supported when nip04 missing", async () => {
    const { nip07Signer } = await import("./NIP07Signer");
    await expect(nip07Signer.decrypt!(PEER_PUBKEY, "ct")).rejects.toThrow(
      "NIP-04 decryption not supported",
    );
  });

  it("nip44Encrypt throws when nip44 missing", async () => {
    const { nip07Signer } = await import("./NIP07Signer");
    await expect(nip07Signer.nip44Encrypt!(PEER_PUBKEY, "txt")).rejects.toThrow(
      "NIP-44 encryption not supported",
    );
  });

  it("nip44Decrypt throws when nip44 missing", async () => {
    const { nip07Signer } = await import("./NIP07Signer");
    await expect(nip07Signer.nip44Decrypt!(PEER_PUBKEY, "ct")).rejects.toThrow(
      "NIP-44 decryption not supported",
    );
  });
});

describe("NIP07Signer — window.nostr present but nip04/nip44 missing", () => {
  beforeEach(() => {
    // nostr present but no nip04/nip44 sub-objects
    vi.stubGlobal("window", {
      nostr: {
        getPublicKey: vi.fn().mockResolvedValue(FAKE_PUBKEY),
        signEvent: vi.fn().mockResolvedValue({}),
        // no nip04 or nip44
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("encrypt throws when nip04 is absent", async () => {
    const { nip07Signer } = await import("./NIP07Signer");
    await expect(nip07Signer.encrypt!(PEER_PUBKEY, "txt")).rejects.toThrow(
      "NIP-04 encryption not supported",
    );
  });

  it("decrypt throws when nip04 is absent", async () => {
    const { nip07Signer } = await import("./NIP07Signer");
    await expect(nip07Signer.decrypt!(PEER_PUBKEY, "ct")).rejects.toThrow(
      "NIP-04 decryption not supported",
    );
  });

  it("nip44Encrypt throws when nip44 is absent", async () => {
    const { nip07Signer } = await import("./NIP07Signer");
    await expect(nip07Signer.nip44Encrypt!(PEER_PUBKEY, "txt")).rejects.toThrow(
      "NIP-44 encryption not supported",
    );
  });

  it("nip44Decrypt throws when nip44 is absent", async () => {
    const { nip07Signer } = await import("./NIP07Signer");
    await expect(nip07Signer.nip44Decrypt!(PEER_PUBKEY, "ct")).rejects.toThrow(
      "NIP-44 decryption not supported",
    );
  });
});
