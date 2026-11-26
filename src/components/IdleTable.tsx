import { useEffect, useRef, useState } from "react";
import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";
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

type Team = "red" | "blue";
type Phase = "play" | "goal" | "won";

// The drawing's own units; the SVG scales them to whatever width it is given. The bead
// rails sit above the field, in the strip the view box adds on top.
const WIDTH = 320;
const HEIGHT = 150;
const RAIL_STRIP = 22;
const RAIL_Y = -11;
const WALL = 6;
const BALL_RADIUS = 5;
const LEFT = WALL + BALL_RADIUS + 3;
const RIGHT = WIDTH - WALL - BALL_RADIUS - 3;
const TOP = WALL + BALL_RADIUS + 3;
const BOTTOM = HEIGHT - WALL - BALL_RADIUS - 3;
// The goal mouths, in the middle of each end wall.
const GOAL_TOP = 55;
const GOAL_BOTTOM = 95;
const MAN_HALF_HEIGHT = 9;
// How far above or below a man's centre the ball can be and still be struck by him.
const MAN_REACH = MAN_HALF_HEIGHT + 2;
// How far each rod slides either way, and how fast.
const SLIDE = 16;
const SLIDE_SPEED = 1.3;

// Each rod: where it crosses the table, whose it is, where its men sit, and where in its
// back-and-forth it starts, so the four don't move as one. Red defends the left goal and
// Blue the right, so a ball in the left goal is a goal for Blue.
const RODS: { x: number; team: Team; men: number[]; phase: number }[] = [
  { x: 60, team: "red", men: [45, 105], phase: 0 },
  { x: 125, team: "blue", men: [35, 75, 115], phase: 1.7 },
  { x: 195, team: "red", men: [35, 75, 115], phase: 3.1 },
  { x: 260, team: "blue", men: [45, 105], phase: 4.6 },
];

const GOALS_TO_WIN = 10;
const BEADS = Array.from({ length: GOALS_TO_WIN }, (_, index) => index);
const BEAD_GAP = 9;
// Red's rail fills from the left edge inwards, Blue's from the right edge inwards.
const beadX = (team: Team, index: number): number =>
  team === "red" ? 14 + index * BEAD_GAP : WIDTH - 14 - index * BEAD_GAP;

// Speeds are in drawing units per frame at 60 frames a second.
const IDLE_SPEED = 1.9;
const KICK_SPEED = 6;
// Share of its speed a kicked ball keeps each frame, until it is back to idling.
const FRICTION = 0.985;
// Slowest the ball may travel along the table, so it never ends up bouncing straight up
// and down between two rods.
const MIN_ALONG = 0.8;
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
  stroke-width: 2;
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
      // The ball comes to rest inside the goal it went into.
      motion.current.x = team === "blue" ? WALL - 1 : WIDTH - WALL + 1;
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
      const offsets = RODS.map((rod) => Math.sin(seconds * SLIDE_SPEED + rod.phase) * SLIDE);
      offsets.forEach((offset, index) => {
        rods.current[index]?.setAttribute("transform", `translate(0 ${offset.toFixed(1)})`);
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
        const before = state.x;
        state.x += state.vx * frames;
        state.y += state.vy * frames;

        if (state.y < TOP || state.y > BOTTOM) {
          state.y = Math.min(BOTTOM, Math.max(TOP, state.y));
          state.vy = -state.vy;
        }

        // An end wall: a goal if the ball arrives at the mouth, a bounce otherwise.
        const atMouth = state.y > GOAL_TOP + 2 && state.y < GOAL_BOTTOM - 2;
        if (state.x < LEFT || state.x > RIGHT) {
          if (atMouth) {
            scoreGoal(state.x < LEFT ? "blue" : "red", now);
          } else {
            state.x = Math.min(RIGHT, Math.max(LEFT, state.x));
            state.vx = -state.vx;
          }
        }

        if (play.phase === "play") {
          // A man in the ball's path sends it back the way it came, with a little spin.
          RODS.forEach((rod, index) => {
            const crossed = (before - rod.x) * (state.x - rod.x) <= 0 && before !== state.x;
            const struck = rod.men.some(
              (man) => Math.abs(state.y - (man + offsets[index])) < MAN_REACH,
            );
            if (crossed && struck) {
              state.x = before;
              state.vx = -state.vx;
              state.vy += (Math.random() - 0.5) * 1.2;
            }
          });

          // A kicked ball slows to its idle pace; an idle one is held there.
          const speed = Math.hypot(state.vx, state.vy) || IDLE_SPEED;
          const target =
            speed > IDLE_SPEED ? Math.max(IDLE_SPEED, speed * FRICTION ** frames) : IDLE_SPEED;
          state.vx *= target / speed;
          state.vy *= target / speed;
          if (Math.abs(state.vx) < MIN_ALONG) {
            state.vx = state.vx < 0 ? -MIN_ALONG : MIN_ALONG;
          }
        }
      }

      ball.current?.setAttribute("cx", motion.current.x.toFixed(1));
      ball.current?.setAttribute("cy", motion.current.y.toFixed(1));
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
        <Field x={WALL} y={WALL} width={WIDTH - 2 * WALL} height={HEIGHT - 2 * WALL} rx="10" />
        <Marking>
          <line x1={WIDTH / 2} y1={WALL} x2={WIDTH / 2} y2={HEIGHT - WALL} />
          <circle cx={WIDTH / 2} cy={HEIGHT / 2} r="18" />
        </Marking>
        {/* The two goals. */}
        <rect
          x="2"
          y={GOAL_TOP}
          width="6"
          height={GOAL_BOTTOM - GOAL_TOP}
          rx="2"
          fill="var(--md-sys-color-primary)"
        />
        <rect
          x={WIDTH - 8}
          y={GOAL_TOP}
          width="6"
          height={GOAL_BOTTOM - GOAL_TOP}
          rx="2"
          fill="var(--md-sys-color-primary)"
        />
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
                x={rod.x - 4}
                y={man - MAN_HALF_HEIGHT}
                width="8"
                height={MAN_HALF_HEIGHT * 2}
                rx="3"
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
