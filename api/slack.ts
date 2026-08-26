// The .js extension is required: package.json sets "type": "module", so the compiled
// function runs as ESM and Node will not resolve an extensionless relative import.
import { buildCommandResponse, verifySlackSignature } from "./_lib/slackCommand.js";

// Slack slash command endpoint. Configure the command's Request URL as
// https://<deployment>/api/slack and set SLACK_SIGNING_SECRET from the app's Basic Information page.
// ALLOWED_ORIGIN doubles as the public app URL, exactly as in api/send.ts.
const allowedOrigin = process.env.ALLOWED_ORIGIN ?? "";
const appUrl = allowedOrigin.startsWith("https://") ? allowedOrigin.replace(/\/+$/, "") : "";

// The Web handler signature keeps the body unparsed, which the signature check depends on.
export async function POST(request: Request): Promise<Response> {
  const signingSecret = process.env.SLACK_SIGNING_SECRET ?? "";
  if (!signingSecret || !appUrl) {
    console.error("slack: SLACK_SIGNING_SECRET or ALLOWED_ORIGIN is not set");
    return Response.json({
      response_type: "ephemeral",
      text: "Foosball Matchmaker is not configured for Slack yet.",
    });
  }

  const rawBody = await request.text();
  const valid = verifySlackSignature({
    rawBody,
    timestamp: request.headers.get("x-slack-request-timestamp"),
    signature: request.headers.get("x-slack-signature"),
    signingSecret,
  });

  if (!valid) {
    console.warn("slack: rejected request with a bad or stale signature");
    return new Response("Invalid signature", { status: 401 });
  }

  // Slack posts the command as application/x-www-form-urlencoded; `text` is whatever
  // followed `/foos`, so `/foos ABC123` deep-links straight into that table.
  const argument = new URLSearchParams(rawBody).get("text") ?? "";
  return Response.json(buildCommandResponse(appUrl, argument));
}
