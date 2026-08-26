import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildCommandResponse, verifySlackSignature } from "../api/_lib/slackCommand";

const APP_URL = "https://foosball-matchmaker.web.app";
const SECRET = "8f742231b10e8888abcd99yyyzzz85a5";
const BODY = "command=%2Ffoos&text=&user_id=U0001";
const NOW = 1_700_000_000;

const sign = (body: string, timestamp: number, secret = SECRET): string =>
  `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex")}`;

const verify = (overrides: Partial<Parameters<typeof verifySlackSignature>[0]> = {}): boolean =>
  verifySlackSignature({
    rawBody: BODY,
    timestamp: String(NOW),
    signature: sign(BODY, NOW),
    signingSecret: SECRET,
    nowSeconds: NOW,
    ...overrides,
  });

const buttonUrl = (response: ReturnType<typeof buildCommandResponse>): string =>
  (response.blocks[1] as { elements: { url: string }[] }).elements[0].url;

describe("verifySlackSignature", () => {
  it("accepts a correctly signed request", () => {
    expect(verify()).toBe(true);
  });

  it("rejects a signature made with another secret", () => {
    expect(verify({ signature: sign(BODY, NOW, "wrong-secret") })).toBe(false);
  });

  it("rejects a tampered body", () => {
    expect(verify({ rawBody: `${BODY}&injected=1` })).toBe(false);
  });

  it("rejects a replay outside the five-minute window", () => {
    expect(verify({ nowSeconds: NOW + 301 })).toBe(false);
    expect(verify({ nowSeconds: NOW + 299 })).toBe(true);
  });

  it("rejects missing or malformed headers", () => {
    expect(verify({ signature: null })).toBe(false);
    expect(verify({ timestamp: null })).toBe(false);
    expect(verify({ timestamp: "not-a-number" })).toBe(false);
    expect(verify({ signature: "v0=short" })).toBe(false);
  });
});

describe("buildCommandResponse", () => {
  it("links to the app root when no table code is given", () => {
    const response = buildCommandResponse(APP_URL, "  ");
    expect(response.response_type).toBe("ephemeral");
    expect(buttonUrl(response)).toBe(`${APP_URL}/`);
  });

  it("deep-links into a table code, normalising case", () => {
    expect(buttonUrl(buildCommandResponse(APP_URL, " abc123 "))).toBe(`${APP_URL}/?table=ABC123`);
  });

  it("ignores anything that is not a table code", () => {
    for (const argument of ["help", "ABC12", "ABC1234", "<script>", "AB C12"]) {
      expect(buttonUrl(buildCommandResponse(APP_URL, argument))).toBe(`${APP_URL}/`);
    }
  });
});
