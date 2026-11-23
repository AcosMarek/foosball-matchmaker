// Pure helpers for the push fan-out in api/send.ts, kept free of firebase-admin so they
// can be unit-tested from the client test suite.

export type TokenTarget = { uid: string; token: string };

type SendResult = { success: boolean; error?: { code?: string } };

// FCM answers with these once a browser has unsubscribed or the token was never valid;
// such a token will never deliver again, so its document is safe to delete.
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

export const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
};

// `results` lines up index-for-index with `targets`. A user counts as notified once any
// one of their devices accepts the message.
export const summarizeDelivery = (
  targets: TokenTarget[],
  results: SendResult[],
): { delivered: number; notifiedUids: string[]; deadTokens: string[]; failures: string[] } => {
  const notified = new Set<string>();
  const deadTokens: string[] = [];
  const failures: string[] = [];
  let delivered = 0;

  results.forEach((result, index) => {
    const target = targets[index];
    if (!target) {
      return;
    }

    if (result.success) {
      delivered += 1;
      notified.add(target.uid);
      return;
    }

    const code = result.error?.code ?? "unknown";
    failures.push(code);
    if (DEAD_TOKEN_CODES.has(code)) {
      deadTokens.push(target.token);
    }
  });

  return { delivered, notifiedUids: [...notified], deadTokens, failures };
};
