import { useEffect, useState } from "react";
import styled from "@emotion/styled";
import type { User } from "firebase/auth";
import { getSessionDisposition, recordMatchResult } from "../api";
import {
  WINNING_GOALS,
  isValidScore,
  matchSizeLabel,
  type MatchDisposition,
} from "../matchmaking";
import { Eyebrow, Hint, Icon, Input, OutlinedCard, PrimaryButton, Row } from "../ui";
import type { Session } from "../types";

type Props = {
  user: User;
  session: Session;
  tableCode: string;
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

const parseGoals = (value: string): number => (value.trim() === "" ? Number.NaN : Number(value));

export const RecordResultCard = ({ user, session, tableCode }: Props) => {
  const [disposition, setDisposition] = useState<MatchDisposition | null>(null);
  const [red, setRed] = useState("");
  const [blue, setBlue] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSessionDisposition(session.id, session.targetPlayers)
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
  }, [session.id, session.targetPlayers]);

  const handleSubmit = async () => {
    const score = { red: parseGoals(red), blue: parseGoals(blue) };
    if (!isValidScore(score)) {
      setStatus(`The winner scores ${WINNING_GOALS} and the loser fewer.`);
      return;
    }

    setBusy(true);
    setStatus("");
    try {
      await recordMatchResult(user, session.id, tableCode, score, disposition);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Couldn't save the result: ${message}`);
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
        Result · {matchSizeLabel(session.targetPlayers)} at{" "}
        {session.startedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </Eyebrow>

      {disposition && (
        <Teams>
          {disposition.teams.map((team) => (
            <Team key={team.color} style={{ borderLeftColor: team.colorHex }}>
              <TeamName style={{ color: team.colorHex }}>{team.color}</TeamName>
              <span>{team.players.map((entry) => entry.player.displayName).join(", ")}</span>
            </Team>
          ))}
        </Teams>
      )}

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
      </Row>
      <Hint>
        {status ||
          `You started this match — log the final score when you're done. Games run to ${WINNING_GOALS}.`}
      </Hint>
    </OutlinedCard>
  );
};
