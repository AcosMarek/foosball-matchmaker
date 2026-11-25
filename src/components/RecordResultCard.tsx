import { useEffect, useState } from "react";
import styled from "@emotion/styled";
import type { User } from "firebase/auth";
import { cancelMatch, getSessionDisposition, recordMatchResult } from "../api";
import {
  WINNING_GOALS,
  isValidScore,
  matchSizeLabel,
  resultDeadline,
  type MatchDisposition,
} from "../matchmaking";
import {
  Eyebrow,
  Hint,
  Icon,
  Input,
  OutlinedCard,
  PrimaryButton,
  Row,
  TextButton,
} from "../ui";
import type { RatingStats } from "../ratings";
import type { Session } from "../types";

type Props = {
  user: User;
  session: Session;
  tableCode: string;
  // Null while ratings are loading or unavailable; the Slack post then leaves them out.
  stats: RatingStats | null;
};

const Teams = styled.div`
  display: grid;
  gap: 0.5rem;
  margin-bottom: 0.9rem;
`;

const Team = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.75rem;
  border-radius: var(--md-shape-small);
  background: var(--md-sys-color-surface-container-high);
  border-left: 4px solid var(--md-sys-color-outline-variant);
  font-size: 0.875rem;
  line-height: 1.25rem;
`;

const TeamName = styled.span`
  font-weight: 600;
  min-width: 3rem;
`;

const ScoreInput = styled(Input)`
  width: 4.5rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
`;

const formatClock = (date: Date): string =>
  date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const parseGoals =(value: string): number => (value.trim() === "" ? Number.NaN : Number(value));

export const RecordResultCard = ({ user, session, tableCode, stats }: Props) => {
  const [disposition, setDisposition] = useState<MatchDisposition | null>(null);
  const [red, setRed] = useState("");
  const [blue, setBlue] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  // Cancelling can't be undone, so it takes a second, explicit tap.
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSessionDisposition(session.id, session.targetPlayers, session.teams)
      .then((next) => {
        if (!cancelled) {
          setDisposition(next);
        }
      })
      .catch(() => {
        // The score can still be logged without the roster on screen.
      });

    return () => {
      cancelled = true;
    };
  }, [session.id, session.targetPlayers, session.teams]);

  const handleSubmit = async () => {
    const score = { red: parseGoals(red), blue: parseGoals(blue) };
    if (!isValidScore(score)) {
      setStatus(`The winner scores ${WINNING_GOALS} and the loser fewer.`);
      return;
    }

    await close(() => recordMatchResult(user, session.id, tableCode, score, disposition, stats));
  };

  // Saving a score and cancelling both close the match, and the rules let that happen
  // once, within the hour. A refusal usually means another player closed it a moment ago,
  // or this device's clock runs behind and the hour is up; either way the card then goes
  // away by itself.
  const close = async (write: () => Promise<void>) => {
    setBusy(true);
    setStatus("");
    try {
      await write();
    } catch (error) {
      const refused = (error as { code?: unknown } | null)?.code === "permission-denied";
      const message = error instanceof Error ? error.message : String(error);
      setConfirmingCancel(false);
      setStatus(
        refused
          ? "Not saved — this match already has a score or was cancelled, or its hour is up."
          : `Couldn't save: ${message}`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <OutlinedCard>
      <Eyebrow>
        <Icon size={16} aria-hidden>
          scoreboard
        </Icon>
        Result · {matchSizeLabel(session.targetPlayers)} at {formatClock(session.startedAt)}
      </Eyebrow>

      {disposition && (
        <Teams>
          {disposition.teams.map((team) => (
            <Team key={team.color} style={{ borderLeftColor: team.cssColor }}>
              <TeamName style={{ color: team.cssColor }}>{team.color}</TeamName>
              <span>{team.players.map((entry) => entry.player.displayName).join(", ")}</span>
            </Team>
          ))}
        </Teams>
      )}

      {confirmingCancel ? (
        <>
          <Row>
            <PrimaryButton
              type="button"
              onClick={() => void close(() => cancelMatch(user, session.id))}
              disabled={busy}
            >
              <Icon aria-hidden>cancel</Icon>
              Yes, cancel match
            </PrimaryButton>
            <TextButton type="button" onClick={() => setConfirmingCancel(false)} disabled={busy}>
              Keep match
            </TextButton>
          </Row>
          <Hint>
            Cancel this match for everyone in it? No score is logged and nobody's rating
            changes. It can't be undone.
          </Hint>
        </>
      ) : (
        <>
          <Row>
            <ScoreInput
              type="number"
              min={0}
              max={WINNING_GOALS}
              inputMode="numeric"
              placeholder="Red"
              aria-label="Red score"
              value={red}
              onChange={(event) => setRed(event.target.value)}
            />
            <ScoreInput
              type="number"
              min={0}
              max={WINNING_GOALS}
              inputMode="numeric"
              placeholder="Blue"
              aria-label="Blue score"
              value={blue}
              onChange={(event) => setBlue(event.target.value)}
            />
            <PrimaryButton type="button" onClick={() => void handleSubmit()} disabled={busy}>
              <Icon aria-hidden>check</Icon>
              Save result
            </PrimaryButton>
            <TextButton
              type="button"
              onClick={() => {
                setStatus("");
                setConfirmingCancel(true);
              }}
              disabled={busy}
            >
              Cancel match
            </TextButton>
          </Row>
          <Hint>
            {status ||
              `You played in this match — anyone in it can log the final score or cancel it, once, until ${formatClock(
                resultDeadline(session.startedAt),
              )}. Games run to ${WINNING_GOALS}.`}
          </Hint>
        </>
      )}
    </OutlinedCard>
  );
};
