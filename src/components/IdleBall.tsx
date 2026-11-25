import { useEffect, useRef } from "react";
import styled from "@emotion/styled";
import { prefersReducedMotion } from "../motion";

// Something to look at, and poke, while no match is running: a ball rolling lazily under
// a row of rods. Tapping it has the nearest rod kick it, after which it bounces between
// the ends and settles back to a roll. Pure decoration: with reduced motion it sits still.

const WIDTH = 200;
const HEIGHT = 84;
const ROD_CENTERS = [30, 65, 100, 135, 170];
const BALL_RADIUS = 7;
const BALL_Y = 67;
const LEFT_WALL = 10 + BALL_RADIUS + 2;
const RIGHT_WALL = WIDTH - 10 - BALL_RADIUS - 2;
// Speeds are in drawing units per frame at 60 frames a second.
const IDLE_SPEED = 0.35;
const KICK_SPEED = 5;
const KICK_SPREAD = 3;
// Share of its speed a kicked ball keeps each frame.
const FRICTION = 0.985;
const FRAME_MS = 1000 / 60;

const Toy = styled.button`
  display: block;
  margin: 0 0 0.4rem;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: var(--md-shape-small);
  /* On a phone: no grey flash on tap, and repeated taps kick instead of zooming the page. */
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  max-width: 100%;
  &:focus-visible {
    outline: 2px solid var(--md-sys-color-primary);
    outline-offset: 4px;
  }
  & svg {
    display: block;
  }
`;

const Rod = styled.rect`
  fill: var(--md-sys-color-primary);
  /* Swings from where it meets the bar. */
  transform-box: fill-box;
  transform-origin: 50% 0;
`;

export const IdleBall = () => {
  const ball = useRef<SVGGElement>(null);
  const rods = useRef<(SVGRectElement | null)[]>([]);
  // Kept in a ref and written straight to the SVG: sixty renders a second of the whole
  // card would be a lot of work for a toy.
  const motion = useRef({ x: 40, speed: IDLE_SPEED, turn: 0 });

  useEffect(() => {
    if (prefersReducedMotion()) {
      return;
    }

    let frame = 0;
    let last = performance.now();
    // The browser stops calling this while the tab is hidden, so the ball costs nothing
    // in the background; the cap keeps it from leaping when the tab comes back.
    const step = (now: number) => {
      const frames = Math.min(3, (now - last) / FRAME_MS);
      last = now;

      const state = motion.current;
      state.x += state.speed * frames;
      state.turn += ((state.speed * frames) / BALL_RADIUS) * (180 / Math.PI);
      if (state.x < LEFT_WALL || state.x > RIGHT_WALL) {
        state.x = Math.min(RIGHT_WALL, Math.max(LEFT_WALL, state.x));
        state.speed = -state.speed;
      }

      const direction = state.speed < 0 ? -1 : 1;
      state.speed =
        Math.abs(state.speed) > IDLE_SPEED
          ? Math.max(IDLE_SPEED, Math.abs(state.speed) * FRICTION ** frames) * direction
          : IDLE_SPEED * direction;

      ball.current?.setAttribute(
        "transform",
        `translate(${state.x.toFixed(1)} ${BALL_Y}) rotate(${Math.round(state.turn)})`,
      );
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame);
  }, []);

  const kick = () => {
    if (prefersReducedMotion()) {
      return;
    }

    const state = motion.current;
    const heading = state.speed < 0 ? -1 : 1;
    // Mostly onwards, sometimes back the way it came.
    const direction = Math.random() < 0.4 ? -heading : heading;
    state.speed = direction * (KICK_SPEED + Math.random() * KICK_SPREAD);

    const nearest = ROD_CENTERS.reduce(
      (best, center, index) =>
        Math.abs(center - state.x) < Math.abs(ROD_CENTERS[best] - state.x) ? index : best,
      0,
    );
    // A positive rotation swings the rod's foot to the left, so this winds up away from
    // the ball's new direction and then follows through towards it.
    rods.current[nearest]?.animate(
      [
        { transform: "rotate(0deg)" },
        { transform: `rotate(${direction * 32}deg)`, offset: 0.35 },
        { transform: `rotate(${direction * -38}deg)`, offset: 0.65 },
        { transform: "rotate(0deg)" },
      ],
      { duration: 500, easing: "ease-in-out" },
    );
  };

  return (
    <Toy type="button" aria-label="Kick the ball" title="Kick the ball" onClick={kick}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT} aria-hidden>
        <rect x="10" y="10" width={WIDTH - 20} height="6" rx="3" fill="var(--md-sys-color-primary)" />
        {ROD_CENTERS.map((center, index) => (
          <Rod
            key={center}
            ref={(element) => {
              rods.current[index] = element;
            }}
            x={center - 4}
            y="16"
            width="8"
            height="34"
            rx="4"
          />
        ))}
        <line
          x1="10"
          y1="75"
          x2={WIDTH - 10}
          y2="75"
          stroke="var(--md-sys-color-outline-variant)"
          strokeWidth="1"
        />
        <g ref={ball} transform={`translate(40 ${BALL_Y})`}>
          <circle r={BALL_RADIUS} fill="var(--md-sys-color-tertiary)" />
          {/* An off-centre highlight, so the ball can be seen to roll. */}
          <circle cx="3" cy="-2.5" r="1.7" fill="var(--md-sys-color-tertiary-container)" />
        </g>
      </svg>
    </Toy>
  );
};
