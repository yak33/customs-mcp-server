/**
 * Identity resolution tests: override > env defaults > error.
 */
import { describe, expect, it } from "vitest";

import { ConfigError } from "../../src/errors/types.js";
import {
  identityCacheKey,
  resolveIdentity,
  type IdentityOverride,
} from "../../src/identity.js";
import type { IdentityDefaults } from "../../src/config.js";

const DEFAULTS: IdentityDefaults = {
  platform: "mcp",
  externalUserId: "default-user",
  externalCorpId: "mcp-prod",
  channel: "mcp",
};

describe("resolveIdentity", () => {
  it("uses env defaults when override is undefined", () => {
    const id = resolveIdentity(undefined, DEFAULTS);
    expect(id.platform).toBe("mcp");
    expect(id.externalUserId).toBe("default-user");
    expect(id.externalCorpId).toBe("mcp-prod");
    expect(id.channel).toBe("mcp");
  });

  it("override fields take precedence per-field", () => {
    const override: IdentityOverride = {
      platform: "cursor",
      externalUserId: "alice",
    };
    const id = resolveIdentity(override, DEFAULTS);
    expect(id.platform).toBe("cursor");
    expect(id.externalUserId).toBe("alice");
    expect(id.externalCorpId).toBe("mcp-prod"); // unchanged
    expect(id.channel).toBe("mcp"); // unchanged
  });

  it("trims override values", () => {
    const id = resolveIdentity(
      { platform: "  cursor  " } as IdentityOverride,
      DEFAULTS,
    );
    expect(id.platform).toBe("cursor");
  });

  it("falls back to defaults when override field is empty string", () => {
    // zod has min(1) so empty string is rejected before reaching here in
    // production, but resolveIdentity itself should not pick an empty value
    const override: IdentityOverride = {
      platform: "   ",
    } as IdentityOverride;
    // The current implementation treats empty-after-trim as missing -> falls back
    const id = resolveIdentity(override, DEFAULTS);
    expect(id.platform).toBe("mcp");
  });

  it("channel falls back to override.channel > defaults.channel > platform", () => {
    // Case 1: explicit channel in override
    const id1 = resolveIdentity(
      { channel: "claude-code-direct" } as IdentityOverride,
      DEFAULTS,
    );
    expect(id1.channel).toBe("claude-code-direct");

    // Case 2: no override channel, defaults.channel exists
    const id2 = resolveIdentity(undefined, DEFAULTS);
    expect(id2.channel).toBe("mcp");

    // Case 3: no override channel, no defaults.channel, falls back to platform
    const id3 = resolveIdentity(undefined, { ...DEFAULTS, channel: "" });
    expect(id3.channel).toBe("mcp");
  });

  it("throws ConfigError when a required field is missing from both layers", () => {
    const incompleteDefaults: IdentityDefaults = {
      platform: "",
      externalUserId: "alice",
      externalCorpId: "corp",
      channel: "",
    };
    expect(() => resolveIdentity(undefined, incompleteDefaults)).toThrow(
      ConfigError,
    );
  });

  it("returns a frozen identity object", () => {
    const id = resolveIdentity(undefined, DEFAULTS);
    expect(Object.isFrozen(id)).toBe(true);
  });
});

describe("identityCacheKey", () => {
  it("only depends on (platform, externalUserId)", () => {
    const a = resolveIdentity(undefined, DEFAULTS);
    const b = resolveIdentity(
      { externalCorpId: "different-corp", channel: "different-channel" },
      DEFAULTS,
    );
    expect(identityCacheKey(a)).toBe(identityCacheKey(b));
  });

  it("produces distinct keys for distinct identities", () => {
    const alice = resolveIdentity(
      { externalUserId: "alice" },
      DEFAULTS,
    );
    const bob = resolveIdentity({ externalUserId: "bob" }, DEFAULTS);
    expect(identityCacheKey(alice)).not.toBe(identityCacheKey(bob));
  });
});
