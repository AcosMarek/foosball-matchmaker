import { useEffect, useRef, useState } from "react";
import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";
import {
  BALL_RADIUS,
  FIELD_CORNER,
  GOAL_BOTTOM,
  GOAL_TOP,
  HEIGHT,
  IDLE_SPEED,
  KICK_SPEED,
  MAN_CORNER,
  MAN_HALF_HEIGHT,
  MAN_HALF_WIDTH,
  RODS,
  WALL,
  WALL_FACE,
  WALL_THICKNESS,
  WIDTH,
  advanceBall,
  paceBall,
  rodOffset,
  type Team,
} from "../idleTable";
import { prefersReducedMotion } from "../motion";

// Something to watch, and poke, while no match is running: a small foosball table seen
// from above that plays itself. The ball starts in the middle heading a random way,
// bounces off the walls and the sliding men, and scores when it finds a goal. Each side
// counts its goals on a rail of ten beads, as on a real table. First to ten wins: the
// winning men spin, the losing men keel over, and a new game starts. It goes on for ever
// and no two games are alike. Tapping the table kicks the ball.
//
// It has a shape of its own, so on a wide screen it sits centred at a sensible size
// instead of stretching. Pure decoration: with reduced motion it is a still picture.
//
// This file is the drawing and the run of play. Where everything is and how the ball
// comes off it is in ../idleTable, which the drawing takes its measurements from.

type Phase = "play" | "goal" | "won";

// The bead rails sit above the field, in the strip the view box adds on top.
const RAIL_STRIP = 22;
const RAIL_Y = -11;

const GOALS_TO_WIN = 10;
const BEADS = Array.from({ length: GOALS_TO_WIN }, (_, index) => index);
const BEAD_GAP = 9;
// Red's rail fills from the left edge inwards, Blue's from the right edge inwards.
const beadX = (team: Team, index: number): number =>
  team === "red" ? 14 + index * BEAD_GAP : WIDTH - 14 - index * BEAD_GAP;

// A ball leaves the centre spot within this angle of straight down the table, either way.
const SERVE_SPREAD = Math.PI / 3;
const FRAME_MS = 1000 / 60;
// How long the ball rests in the goal after scoring, and how long a win is celebrated.
const GOAL_PAUSE_MS = 900;
const WIN_PAUSE_MS = 3200;

const teamColor = (team: Team): string =>
  team === "red" ? "var(--team-red)" : "var(--team-blue)";

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const keelOver = keyframes`
  to { transform: rotate(78deg); opacity: 0.45; }
`;

const pop = keyframes`
  from { transform: scale(0); }
  60% { transform: scale(1.5); }
  to { transform: scale(1); }
`;

const Toy = styled.button`
  display: block;
  width: 100%;
  max-width: 420px;
  margin: 0 auto 0.6rem;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: var(--md-shape-medium);
  /* On a phone: no grey flash on tap, and repeated taps kick instead of zooming the page. */
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  &:focus-visible {
    outline: 2px solid var(--md-sys-color-primary);
    outline-offset: 4px;
  }
  & svg {
    display: block;
    width: 100%;
    height: auto;
  }
`;

// A pale green playing surface. The plain fill is for browsers without color-mix.
const Field = styled.rect`
  fill: var(--md-sys-color-surface-container-high);
  fill: color-mix(
    in srgb,
    var(--md-sys-color-primary-container) 45%,
    var(--md-sys-color-surface-container-lowest)
  );
  stroke: var(--md-sys-color-primary);
`;

const Marking = styled.g`
  fill: none;
  stroke: var(--md-sys-color-primary);
  stroke-width: 1;
  opacity: 0.5;
`;

// A man on a rod. The winners spin on the spot, which no real table allows; the losers
// keel over.
const Man = styled.rect`
  transform-box: fill-box;
  transform-origin: center;
  &[data-mood="won"] {
    animation: ${spin} 0.5s linear infinite;
  }
  &[data-mood="lost"] {
    animation: ${keelOver} 0.45s ease-in forwards;
  }
`;

// One bead on a scoring rail: hollow until its goal is scored, then filled with a pop.
const Bead = styled.circle`
  transform-box: fill-box;
  transform-origin: center;
  stroke-width: 1.2;
  &[data-new="true"] {
    animation: ${pop} 0.45s ease-out;
  }
`;

const Banner = styled.g`
  transform-box: fill-box;
  transform-origin: center;
  animation: ${pop} 0.45s ease-out;
`;

export const IdleTable = () => {
  const button = useRef<HTMLButtonElement>(null);
  const ball = useRef<SVGCircleElement>(null);
  const rods = useRef<(SVGGElement | null)[]>([]);
  // The ball and the state of play are kept in refs and written straight to the SVG:
  // sixty renders a second of the whole card would be a lot of work for a toy. Only a
  // goal or a win changes what React draws (the beads, the banner, the men's mood).
  const motion = useRef({ x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0 });
  const game = useRef({ red: 0, blue: 0, phase: "play" as Phase, until: 0 });
  const [score, setScore] = useState({ red: 0, blue: 0 });
  const [winner, setWinner] = useState<Team | null>(null);

  useEffect(() => {
    const host = button.current;
    if (!host || prefersReducedMotion()) {
      return;
    }

    let frame = 0;
    let last = 0;
    const startedAt = performance.now();

    // Puts the ball on the centre spot, heading a random way down the table.
    const serve = () => {
      const angle = (Math.random() - 0.5) * 2 * SERVE_SPREAD;
      const along = Math.random() < 0.5 ? -1 : 1;
      motion.current = {
        x: WIDTH / 2,
        y: HEIGHT / 2,
        vx: Math.cos(angle) * IDLE_SPEED * along,
        vy: Math.sin(angle) * IDLE_SPEED,
      };
      ball.current?.animate([{ transform: "scale(0)" }, { transform: "scale(1)" }], {
        duration: 300,
        easing: "ease-out",
      });
    };

    const scoreGoal = (team: Team, now: number) => {
      const play = game.current;
      play[team] += 1;
      setScore({ red: play.red, blue: play.blue });
      // The ball comes to rest where it crossed the line, inside the goal.
      motion.current.vx = 0;
      motion.current.vy = 0;

      if (play[team] >= GOALS_TO_WIN) {
        play.phase = "won";
        play.until = now + WIN_PAUSE_MS;
        setWinner(team);
      } else {
        play.phase = "goal";
        play.until = now + GOAL_PAUSE_MS;
      }
    };

    const step = (now: number) => {
      // Capped so the ball doesn't leap when the tab comes back from the background.
      const frames = Math.min(3, (now - (last || now)) / FRAME_MS);
      last = now;

      const seconds = (now - startedAt) / 1000;
      const offsets = RODS.map((rod) => rodOffset(rod, seconds));
      offsets.forEach((offset, index) => {
        rods.current[index]?.setAttribute("transform", `translate(0 ${offset.toFixed(2)})`);
      });

      const play = game.current;
      const state = motion.current;

      if (play.phase !== "play") {
        // Resting after a goal, or celebrating a win. Then the next ball, and after a
        // win a fresh game.
        if (now >= play.until) {
          if (play.phase === "won") {
            play.red = 0;
            play.blue = 0;
            setScore({ red: 0, blue: 0 });
            setWinner(null);
          }
          play.phase = "play";
          serve();
        }
      } else {
        const scorer = advanceBall(state, frames, seconds);
        if (scorer) {
          scoreGoal(scorer, now);
        } else {
          paceBall(state, frames);
        }
      }

      ball.current?.setAttribute("cx", motion.current.x.toFixed(2));
      ball.current?.setAttribute("cy", motion.current.y.toFixed(2));
      frame = requestAnimationFrame(step);
    };

    serve();

    // Only runs while the table is on screen. The browser already pauses it in a hidden
    // tab; this covers a visible tab scrolled down to the leaderboard.
    const start = () => {
      if (!frame) {
        last = 0;
        frame = requestAnimationFrame(step);
      }
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    if (typeof IntersectionObserver === "undefined") {
      start();
      return stop;
    }

    const watcher = new IntersectionObserver(([entry]) =>
      entry.isIntersecting ? start() : stop(),
    );
    watcher.observe(host);

    return () => {
      watcher.disconnect();
      stop();
    };
  }, []);

  const kick = () => {
    if (prefersReducedMotion() || game.current.phase !== "play") {
      return;
    }

    // Off in a fresh direction, mostly along the table.
    const angle = (Math.random() - 0.5) * 1.2;
    const along = Math.random() < 0.5 ? -1 : 1;
    const state = motion.current;
    state.vx = Math.cos(angle) * KICK_SPEED * along;
    state.vy = Math.sin(angle) * KICK_SPEED;
  };

  return (
    <Toy ref={button} type="button" aria-label="Kick the ball" title="Kick the ball" onClick={kick}>
      <svg viewBox={`0 ${-RAIL_STRIP} ${WIDTH} ${HEIGHT + RAIL_STRIP}`} aria-hidden>
        {(["red", "blue"] as const).map((team) => (
          <g key={team}>
            <line
              x1={beadX(team, 0)}
              y1={RAIL_Y}
              x2={beadX(team, GOALS_TO_WIN - 1)}
              y2={RAIL_Y}
              stroke="var(--md-sys-color-outline-variant)"
              strokeWidth="1"
            />
            {BEADS.map((index) => (
              <Bead
                key={index}
                cx={beadX(team, index)}
                cy={RAIL_Y}
                r="3.4"
                stroke={teamColor(team)}
                fill={index < score[team] ? teamColor(team) : "var(--md-sys-color-surface-container-lowest)"}
                data-new={index === score[team] - 1}
              />
            ))}
          </g>
        ))}
        <Field
          x={WALL}
          y={WALL}
          width={WIDTH - 2 * WALL}
          height={HEIGHT - 2 * WALL}
          rx={FIELD_CORNER}
          strokeWidth={WALL_THICKNESS}
        />
        <Marking>
          <line x1={WIDTH / 2} y1={WALL} x2={WIDTH / 2} y2={HEIGHT - WALL} />
          <circle cx={WIDTH / 2} cy={HEIGHT / 2} r="18" />
        </Marking>
        {/* The two goals: an opening in each end wall, between the posts the ball can
            clip, with a shallow box behind it for the ball to come to rest in. */}
        {[WALL_FACE, WIDTH - WALL_FACE].map((face) => {
          const back = face < WIDTH / 2 ? 1.5 : WIDTH - 1.5;

          return (
            <path
              key={face}
              d={`M ${face} ${GOAL_TOP} H ${back} V ${GOAL_BOTTOM} H ${face}`}
              fill="var(--md-sys-color-surface-container-lowest)"
              stroke="var(--md-sys-color-primary)"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          );
        })}
        {/* The rods themselves stay put: a sliding straight line looks no different, and
            this way they never reach up into the bead rails. Only the men move. */}
        {RODS.map((rod) => (
          <line
            key={rod.x}
            x1={rod.x}
            y1={-3}
            x2={rod.x}
            y2={HEIGHT + 3}
            stroke="var(--md-sys-color-outline)"
            strokeWidth="2"
          />
        ))}
        {RODS.map((rod, index) => (
          <g
            key={rod.x}
            ref={(element) => {
              rods.current[index] = element;
            }}
          >
            {rod.men.map((man) => (
              <Man
                key={man}
                x={rod.x - MAN_HALF_WIDTH}
                y={man - MAN_HALF_HEIGHT}
                width={MAN_HALF_WIDTH * 2}
                height={MAN_HALF_HEIGHT * 2}
                rx={MAN_CORNER}
                fill={teamColor(rod.team)}
                data-mood={winner ? (winner === rod.team ? "won" : "lost") : undefined}
              />
            ))}
          </g>
        ))}
        <circle
          ref={ball}
          cx={WIDTH / 2}
          cy={HEIGHT / 2}
          r={BALL_RADIUS}
          fill="var(--md-sys-color-on-surface)"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
        {winner && (
          <Banner>
            <rect
              x={WIDTH / 2 - 52}
              y={HEIGHT / 2 - 14}
              width="104"
              height="28"
              rx="14"
              fill="var(--md-sys-color-surface-container-lowest)"
              stroke={teamColor(winner)}
              strokeWidth="1.5"
            />
            <text
              x={WIDTH / 2}
              y={HEIGHT / 2 + 5}
              textAnchor="middle"
              fontSize="14"
              fontWeight="700"
              fill={teamColor(winner)}
            >
              {winner === "red" ? "Red" : "Blue"} wins!
            </text>
          </Banner>
        )}
      </svg>
    </Toy>
  );
};
