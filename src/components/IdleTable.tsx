import { useEffect, useRef } from "react";
import styled from "@emotion/styled";
import { prefersReducedMotion } from "../motion";

// Something to look at, and poke, while no match is running: a small foosball table seen
// from above, its rods sliding and a ball bouncing between the men. Tapping it gives the
// ball a kick. It has a shape of its own, so on a wide screen it sits centred at a
// sensible size instead of stretching. Pure decoration: with reduced motion it is a still
// picture.

// The drawing's own units; the SVG scales them to whatever width it is given.
const WIDTH = 320;
const HEIGHT = 150;
const WALL = 6;
const BALL_RADIUS = 5;
const LEFT = WALL + BALL_RADIUS + 3;
const RIGHT = WIDTH - WALL - BALL_RADIUS - 3;
const TOP = WALL + BALL_RADIUS + 3;
const BOTTOM = HEIGHT - WALL - BALL_RADIUS - 3;
const MAN_HALF_HEIGHT = 9;
// How far above or below a man's centre the ball can be and still be struck by him.
const MAN_REACH = MAN_HALF_HEIGHT + 2;
// How far each rod slides either way, and how fast.
const SLIDE = 16;
const SLIDE_SPEED = 1.3;

// Each rod: where it crosses the table, whose it is, where its men sit, and where in its
// back-and-forth it starts, so the four don't move as one.
const RODS = [
  { x: 60, team: "red", men: [45, 105], phase: 0 },
  { x: 125, team: "blue", men: [35, 75, 115], phase: 1.7 },
  { x: 195, team: "red", men: [35, 75, 115], phase: 3.1 },
  { x: 260, team: "blue", men: [45, 105], phase: 4.6 },
] as const;

// Speeds are in drawing units per frame at 60 frames a second.
const IDLE_SPEED = 1.7;
const KICK_SPEED = 6;
// Share of its speed a kicked ball keeps each frame, until it is back to idling.
const FRICTION = 0.985;
// Slowest the ball may travel along the table, so it never ends up bouncing straight up
// and down between two rods.
const MIN_ALONG = 0.8;
const FRAME_MS = 1000 / 60;

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

export const IdleTable = () => {
  const button = useRef<HTMLButtonElement>(null);
  const ball = useRef<SVGCircleElement>(null);
  const rods = useRef<(SVGGElement | null)[]>([]);
  // Kept in a ref and written straight to the SVG: sixty renders a second of the whole
  // card would be a lot of work for a toy.
  const motion = useRef({ x: WIDTH / 2, y: HEIGHT / 2, vx: IDLE_SPEED * 0.85, vy: IDLE_SPEED * 0.5 });

  useEffect(() => {
    const host = button.current;
    if (!host || prefersReducedMotion()) {
      return;
    }

    let frame = 0;
    let last = 0;
    const startedAt = performance.now();

    const step = (now: number) => {
      // Capped so the ball doesn't leap when the tab comes back from the background.
      const frames = Math.min(3, (now - (last || now)) / FRAME_MS);
      last = now;

      const seconds = (now - startedAt) / 1000;
      const offsets = RODS.map((rod) => Math.sin(seconds * SLIDE_SPEED + rod.phase) * SLIDE);
      offsets.forEach((offset, index) => {
        rods.current[index]?.setAttribute("transform", `translate(0 ${offset.toFixed(1)})`);
      });

      const state = motion.current;
      const before = state.x;
      state.x += state.vx * frames;
      state.y += state.vy * frames;

      if (state.x < LEFT || state.x > RIGHT) {
        state.x = Math.min(RIGHT, Math.max(LEFT, state.x));
        state.vx = -state.vx;
      }
      if (state.y < TOP || state.y > BOTTOM) {
        state.y = Math.min(BOTTOM, Math.max(TOP, state.y));
        state.vy = -state.vy;
      }

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
      const target = speed > IDLE_SPEED ? Math.max(IDLE_SPEED, speed * FRICTION ** frames) : IDLE_SPEED;
      state.vx *= target / speed;
      state.vy *= target / speed;
      if (Math.abs(state.vx) < MIN_ALONG) {
        state.vx = state.vx < 0 ? -MIN_ALONG : MIN_ALONG;
      }

      ball.current?.setAttribute("cx", state.x.toFixed(1));
      ball.current?.setAttribute("cy", state.y.toFixed(1));
      frame = requestAnimationFrame(step);
    };

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
    if (prefersReducedMotion()) {
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
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden>
        <Field x={WALL} y={WALL} width={WIDTH - 2 * WALL} height={HEIGHT - 2 * WALL} rx="10" />
        <Marking>
          <line x1={WIDTH / 2} y1={WALL} x2={WIDTH / 2} y2={HEIGHT - WALL} />
          <circle cx={WIDTH / 2} cy={HEIGHT / 2} r="18" />
        </Marking>
        {/* The two goals. */}
        <rect x="2" y="55" width="6" height="40" rx="2" fill="var(--md-sys-color-primary)" />
        <rect x={WIDTH - 8} y="55" width="6" height="40" rx="2" fill="var(--md-sys-color-primary)" />
        {RODS.map((rod, index) => (
          <g
            key={rod.x}
            ref={(element) => {
              rods.current[index] = element;
            }}
          >
            <line
              x1={rod.x}
              y1={-SLIDE}
              x2={rod.x}
              y2={HEIGHT + SLIDE}
              stroke="var(--md-sys-color-outline)"
              strokeWidth="2"
            />
            {rod.men.map((man) => (
              <rect
                key={man}
                x={rod.x - 4}
                y={man - MAN_HALF_HEIGHT}
                width="8"
                height={MAN_HALF_HEIGHT * 2}
                rx="3"
                fill={rod.team === "red" ? "var(--team-red)" : "var(--team-blue)"}
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
        />
      </svg>
    </Toy>
  );
};
