import { useEffect, useMemo, useState } from "react";
import styled from "@emotion/styled";
import { matchSizeLabel, teamCssColor } from "../matchmaking";
import { prefersReducedMotion } from "../motion";
import { formatDelta, type MatchRating } from "../ratings";
import { describeBadgeChange, type BadgeChange } from "../badges";
import { Eyebrow, Icon, IconButton, OutlinedCard } from "../ui";
import type { Session } from "../types";

const Stage = styled(OutlinedCard)`
  position: relative;
  /* Confetti flies past the card's edges and is clipped there. */
  overflow: hidden;
  text-align: center;
`;

const Close = styled(IconButton)`
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
`;

const Score = styled.div`
  font-size: 1.75rem;
  line-height: 2.25rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--md-sys-color-on-surface);
  animation: popIn 0.4s cubic-bezier(0.2, 0.9, 0.3, 1.4) both;
`;

const Line = styled.p`
  margin: 0.6rem 0 0;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--md-sys-color-on-surface-variant);
  animation: riseIn 0.4s ease-out 0.3s both;
`;

// The commentary on the match: the app's one-line take on what just happened.
const Remark = styled.p`
  margin: 0.35rem 0 0;
  font-size: 0.9375rem;
  line-height: 1.375rem;
  font-style: italic;
  color: var(--md-sys-color-on-surface);
  animation: riseIn 0.4s ease-out 0.2s both;
`;

// A badge this game handed to one of its players, in one line: the badge, who has it
// now and whom they took it from. The figures behind it are in the statistics dialog.
const WonLine = styled.p`
  margin: 0.6rem 0 0;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--md-sys-color-on-surface);
  animation: riseIn 0.4s ease-out 0.5s both;
  & > span:first-of-type {
    vertical-align: -0.2em;
    margin-right: 0.3em;
    color: var(--md-sys-color-primary);
  }
`;

const RatingRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  margin-top: 0.15rem;
`;

const RatingValue = styled.span`
  font-family: "Roboto Mono", ui-monospace, "SFMono-Regular", monospace;
  font-size: 2rem;
  line-height: 2.5rem;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--md-sys-color-on-surface);
`;

const Gain = styled.span`
  padding: 0.15rem 0.7rem;
  border-radius: var(--md-shape-full);
  background: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  animation: popIn 0.4s cubic-bezier(0.2, 0.9, 0.3, 1.4) 1.2s both;
`;

const Piece = styled.span`
  position: absolute;
  left: 50%;
  top: 45%;
  width: 7px;
  height: 11px;
  border-radius: 2px;
  pointer-events: none;
  animation: confetti 1.1s cubic-bezier(0.1, 0.7, 0.3, 1) both;
`;

const CONFETTI_PIECES = 26;
const COUNT_UP_DELAY_MS = 400;
const COUNT_UP_MS = 900;
// Long enough to read, short enough that the card isn't still there for the next match.
const AUTO_CLOSE_MS = 12000;
// A badge is one more line to read.
const BADGE_READ_MS = 2500;

// Counts from `from` to `to` once `active`, easing out. Only how far along it is gets
// stored, so the number shown is always worked out from the current `from` and `to`: the
// rating arrives a moment after the card does, and must never flash a stale figure.
// With reduced motion it goes straight to the end.
const useCountUp = (from: number, to: number, active: boolean): number => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!active) {
      setProgress(0);
      return;
    }
    if (prefersReducedMotion()) {
      setProgress(1);
      return;
    }

    let frame = 0;
    const startAt = performance.now() + COUNT_UP_DELAY_MS;
    const step = (now: number) => {
      const next = Math.min(1, Math.max(0, (now - startAt) / COUNT_UP_MS));
      setProgress(next);
      if (next < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame);
  }, [from, to, active]);

  return Math.round(from + (to - from) * (1 - (1 - progress) ** 3));
};

type Props = {
  // A match the signed-in user played in whose score has just been logged.
  session: Session;
  // The match as the ratings see it. Null for the moment between the score landing and
  // the ratings catching up; the card shows the score meanwhile.
  match: MatchRating | null;
  // The commentary line for this match, once the ratings include it.
  note?: string;
  // The badges this match handed to its players, once the ratings include it.
  badges?: BadgeChange[];
  // Shown on opening the app, for a result that came in while this player wasn't looking:
  // the same card, without the confetti and labelled as their last game.
  missed?: boolean;
  currentUid: string;
  onClose: () => void;
};

// The moment a score is saved, for the players of that match: the result, confetti in the
// winning side's colour, and for the winners their rating counting up. The losing side
// gets the same card without the numbers: the leaderboard is there for anyone who wants
// to see what the game cost them, and nobody needs it counted down in front of them.
export const ResultCelebration = ({
  session,
  match,
  note,
  badges = [],
  missed = false,
  currentUid,
  onClose,
}: Props) => {
  const result = session.result;
  const redWon = !!result && result.red > result.blue;
  const winner = redWon ? "Red" : "Blue";
  const winnerColor = teamCssColor(winner);

  const teams = match?.teams ?? session.teams;
  const side = teams
    ? teams.findIndex((team) => team.players.some((player) => player.uid === currentUid))
    : -1;
  const won = side !== -1 && side === (redWon ? 0 : 1);
  const before = match?.before[currentUid];
  const gain = match && side !== -1 ? match.delta[side] : 0;
  const showRating = won && before !== undefined;
  const rating = useCountUp(before ?? 0, (before ?? 0) + gain, showRating);

  // The badges arrive with the ratings, a moment after the card; the wait starts over
  // then, so they get their full time.
  // The time only runs while the page can be seen, so a card that arrives in a tab left
  // in the background is still there when its reader comes back.
  const readingTime = AUTO_CLOSE_MS + badges.length * BADGE_READ_MS;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible") {
        timer = setTimeout(onClose, readingTime);
      }
    };

    arm();
    document.addEventListener("visibilitychange", arm);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", arm);
    };
  }, [onClose, readingTime]);

  // Thrown once per match: each piece gets its own direction, spin and head start.
  const pieces = useMemo(() => {
    // Theme colours, so the confetti stays visible on a dark card too.
    const colors = [
      winnerColor,
      winnerColor,
      "var(--md-sys-color-primary)",
      "var(--md-sys-color-tertiary)",
      "var(--md-sys-color-primary)",
    ];

    return Array.from({ length: CONFETTI_PIECES }, (_, index) => {
      const angle = Math.random() * Math.PI * 2;
      const reach = 70 + Math.random() * 130;

      return {
        color: colors[index % colors.length],
        dx: Math.round(Math.cos(angle) * reach),
        dy: Math.round(Math.sin(angle) * reach * 0.6 + 40),
        spin: Math.round(Math.random() * 720 - 360),
        delay: Math.round(Math.random() * 150),
      };
    });
  }, [winnerColor]);

  if (!result) {
    return null;
  }

  // Winners whose rating hasn't loaded yet, the losing side, and (should it ever happen)
  // someone shown a match they weren't in.
  const closingLine = won
    ? "Nice win."
    : side === -1
      ? `${winner} wins.`
      : `Good game. ${winner} takes this one.`;

  return (
    <Stage role="status">
      {(missed ? [] : pieces).map((piece, index) => (
        <Piece
          key={index}
          aria-hidden
          style={
            {
              background: piece.color,
              animationDelay: `${piece.delay}ms`,
              "--dx": `${piece.dx}px`,
              "--dy": `${piece.dy}px`,
              "--spin": `${piece.spin}deg`,
            } as React.CSSProperties
          }
        />
      ))}
      <Close type="button" title="Close" aria-label="Close" onClick={onClose}>
        <Icon aria-hidden>close</Icon>
      </Close>
      <Eyebrow style={{ justifyContent: "center" }}>
        <Icon size={16} aria-hidden>
          sports_score
        </Icon>
        {missed ? "Your last game" : "Full time"} · {matchSizeLabel(session.targetPlayers)}
      </Eyebrow>
      <Score>
        <span style={redWon ? { color: winnerColor } : undefined}>Red {result.red}</span>
        {" – "}
        <span style={redWon ? undefined : { color: winnerColor }}>{result.blue} Blue</span>
      </Score>
      {note && <Remark>{note}</Remark>}
      {badges.map((change) => (
        <WonLine key={change.badge.id}>
          <Icon size={18} aria-hidden>
            {change.badge.icon}
          </Icon>
          <strong>{change.badge.name}</strong>: {describeBadgeChange(change, currentUid)}
        </WonLine>
      ))}
      {showRating ? (
        <>
          <Line>Nice win. Your rating</Line>
          <RatingRow>
            <RatingValue>{rating}</RatingValue>
            <Gain>{formatDelta(gain)}</Gain>
          </RatingRow>
        </>
      ) : (
        <Line>{closingLine}</Line>
      )}
    </Stage>
  );
};
