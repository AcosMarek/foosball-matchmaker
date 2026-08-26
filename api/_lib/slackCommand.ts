import { createHmac, timingSafeEqual } from "node:crypto";

// Slack's signature scheme: https://docs.slack.dev/authentication/verifying-requests-from-slack
const SIGNATURE_VERSION = "v0";
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

const TABLE_CODE_RE = /^[A-Z0-9]{6}$/;

// Slack signs the exact bytes it sent, so the caller must hand over the unparsed body —
// re-encoding a parsed form produces a different string and a digest that never matches.
export const verifySlackSignature = ({
  rawBody,
  timestamp,
  signature,
  signingSecret,
  nowSeconds = Math.floor(Date.now() / 1000),
}: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  signingSecret: string;
  nowSeconds?: number;
}): boolean => {
  if (!timestamp || !signature || !signingSecret) {
    return false;
  }

  // Bounds how long a captured request stays replayable.
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(nowSeconds - sentAt) > MAX_CLOCK_SKEW_SECONDS) {
    return false;
  }

  const digest = createHmac("sha256", signingSecret)
    .update(`${SIGNATURE_VERSION}:${timestamp}:${rawBody}`)
    .digest("hex");
  const expected = Buffer.from(`${SIGNATURE_VERSION}=${digest}`);
  const received = Buffer.from(signature);

  // timingSafeEqual throws on a length mismatch, and the length is not a secret.
  return expected.length === received.length && timingSafeEqual(expected, received);
};

// The reply to `/foos`. Only the invoker sees it (`ephemeral`), and the button is a plain
// `url` element, so Slack opens the link itself — no interactivity endpoint required.
export const buildCommandResponse = (appUrl: string, argument: string) => {
  const code = argument.trim().toUpperCase();
  const table = TABLE_CODE_RE.test(code) ? code : "";
  const url = table ? `${appUrl}/?table=${encodeURIComponent(table)}` : `${appUrl}/`;
  const summary = table
    ? `:soccer:  Table *${table}* is waiting.`
    : ":soccer:  Time for a game? Pick your table and rally a match.";

  return {
    response_type: "ephemeral",
    text: `Start a game: ${url}`,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: summary } },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Start a game" },
            url,
            style: "primary",
          },
        ],
      },
    ],
  };
};
