import { describe, expect, it } from "vitest";
import {
  BALL_RADIUS,
  GOAL_BOTTOM,
  GOAL_TOP,
  HEIGHT,
  IDLE_SPEED,
  KICK_SPEED,
  MAN_CORNER,
  MAN_HALF_HEIGHT,
  MAN_HALF_WIDTH,
  RODS,
  WIDTH,
  advanceBall,
  paceBall,
  rodOffset,
  type Ball,
  type Team,
} from "./idleTable";

// Rounding left over from the arithmetic; anything bigger is a real overlap.
const HAIR = 1e-9;
// Where the ball's centre is when its edge touches the inside of a wall.
const AT_WALL = 7 + BALL_RADIUS;

// Plays the ball on one frame at a time, as the table does, and records where it was at
// the end of each frame. Stops if a goal is scored.
const play = (ball: Ball, frames: number, perCall = 1) => {
  const path: (Ball & { seconds: number })[] = [];
  let scorer: Team | null = null;

  for (let frame = 1; frame <= frames && !scorer; frame += 1) {
    const seconds = (frame * perCall) / 60;
    scorer = advanceBall(ball, perCall, seconds);
    path.push({ ...ball, seconds });
  }

  return { path, scorer };
};

// How far the ball's edge is from the outline of the nearest man: the men are rounded
// rectangles, so this is measured to the rounded outline. Negative means overlapping.
const gapToMen = ({ x, y, seconds }: Ball & { seconds: number }): number =>
  Math.min(
    ...RODS.flatMap((rod) =>
      rod.men.map((man) => {
        const centre = man + rodOffset(rod, seconds);
        const coreX = MAN_HALF_WIDTH - MAN_CORNER;
        const coreY = MAN_HALF_HEIGHT - MAN_CORNER;
        const dx = Math.max(0, Math.abs(x - rod.x) - coreX);
        const dy = Math.max(0, Math.abs(y - centre) - coreY);

        return Math.hypot(dx, dy) - MAN_CORNER - BALL_RADIUS;
      }),
    ),
  );

const defender = RODS[0];

describe("the ball against a man", () => {
  it("comes straight back off the flat side of a man, at the moment they touch", () => {
    const ball = { x: 35, y: 45, vx: IDLE_SPEED, vy: 0 };
    const { path } = play(ball, 20);
    const face = defender.x - MAN_HALF_WIDTH;

    expect(ball.vx).toBe(-IDLE_SPEED);
    expect(ball.vy).toBeCloseTo(0, 12);
    // Its edge reached the man's side and never went past it.
    const furthest = Math.max(...path.map((point) => point.x + BALL_RADIUS));
    expect(furthest).toBeLessThanOrEqual(face + HAIR);
    expect(furthest).toBeGreaterThan(face - IDLE_SPEED);
  });

  it("comes back across the table off the end of a man, not back along it", () => {
    const ball = { x: defender.x, y: 14, vx: 0, vy: IDLE_SPEED };
    const { path } = play(ball, 20);

    expect(ball.vx).toBeCloseTo(0, 12);
    expect(ball.vy).toBeLessThan(0);
    expect(Math.min(...path.map(gapToMen))).toBeGreaterThanOrEqual(-HAIR);
  });

  it("keeps travelling along the table when it clips the end of a man in passing", () => {
    // Heading right and slightly down, onto the top end of the man from above.
    const ball = { x: 46, y: 22, vx: 1.2, vy: 1.45 };
    play(ball, 14);

    expect(ball.vx).toBeGreaterThan(0);
    expect(ball.vy).toBeLessThan(0);
  });

  it("comes off a rounded corner at an angle", () => {
    // Diagonally, square onto the top-left corner of the man: where the corner will be
    // eight frames on, once he has slid a little.
    const ball = { x: 40.6, y: 25.4, vx: 1.34, vy: 1.34 };
    play(ball, 16);

    // Turned back both along and across the table, which neither a flat side nor a flat
    // end would do.
    expect(ball.vx).toBeLessThan(-0.3);
    expect(ball.vy).toBeLessThan(-0.3);
  });

  it("does not pass through a man when kicked, even in slow frames", () => {
    const ball = { x: 30, y: 45, vx: KICK_SPEED, vy: 0 };
    const { path } = play(ball, 3, 3);

    expect(ball.vx).toBe(-KICK_SPEED);
    expect(Math.max(...path.map((point) => point.x))).toBeLessThan(defender.x);
    expect(Math.min(...path.map(gapToMen))).toBeGreaterThanOrEqual(-HAIR);
  });

  it("squirts out sideways when a man pins it against the long wall", () => {
    // Resting against the top wall, just right of the second rod, as that rod's top man
    // slides up to within a few units of the wall.
    const rod = RODS[1];
    const ball = { x: rod.x + 1, y: AT_WALL, vx: 0, vy: 0 };
    for (let frame = 90; frame <= 150; frame += 1) {
      const seconds = frame / 60;
      advanceBall(ball, 1, seconds);

      expect(gapToMen({ ...ball, seconds })).toBeGreaterThanOrEqual(-HAIR);
      expect(ball.y).toBeGreaterThanOrEqual(AT_WALL - HAIR);
    }

    expect(ball.x).toBeGreaterThan(rod.x + MAN_HALF_WIDTH);
  });

  it("is carried along by a man that is moving when they meet", () => {
    // At the start the defender's men are sliding down the table.
    const still = { x: defender.x, y: 14, vx: 0, vy: IDLE_SPEED };
    play(still, 20);

    // Faster back up than it came down would mean the man pushed it; he was moving the
    // other way, so it comes back slower.
    expect(Math.abs(still.vy)).toBeLessThan(IDLE_SPEED);
    expect(Math.abs(still.vy)).toBeGreaterThan(IDLE_SPEED - 1);
  });
});

describe("the ball against the table", () => {
  it("turns round when its edge meets an end wall", () => {
    const ball = { x: 30, y: 30, vx: -IDLE_SPEED, vy: 0 };
    const { path, scorer } = play(ball, 15);

    expect(scorer).toBeNull();
    expect(ball.vx).toBe(IDLE_SPEED);
    expect(ball.vy).toBe(0);
    const nearest = Math.min(...path.map((point) => point.x));
    expect(nearest).toBeGreaterThanOrEqual(AT_WALL - HAIR);
    expect(nearest).toBeLessThan(AT_WALL + IDLE_SPEED);
  });

  it("turns round when its edge meets a long wall", () => {
    const ball = { x: 92, y: 30, vx: 0, vy: -IDLE_SPEED };
    const { path } = play(ball, 15);

    expect(ball.vx).toBe(0);
    expect(ball.vy).toBe(IDLE_SPEED);
    expect(Math.min(...path.map((point) => point.y))).toBeGreaterThanOrEqual(AT_WALL - HAIR);
  });

  it("follows the round of the table's corners", () => {
    const ball = { x: 32, y: 32, vx: -1.34, vy: -1.34 };
    const { path } = play(ball, 30);

    expect(ball.vx).toBeGreaterThan(0);
    expect(ball.vy).toBeGreaterThan(0);
    // The corner is rounded about (16, 16); the ball's centre can be 4 from there.
    for (const point of path.filter((point) => point.x < 16 && point.y < 16)) {
      expect(Math.hypot(point.x - 16, point.y - 16)).toBeLessThanOrEqual(4 + HAIR);
    }
  });

  it("scores for Blue in the left goal and for Red in the right", () => {
    const left = { x: 30, y: 75, vx: -IDLE_SPEED, vy: 0 };
    expect(play(left, 30).scorer).toBe("blue");
    expect(left.x).toBeLessThanOrEqual(BALL_RADIUS);

    const right = { x: WIDTH - 30, y: 75, vx: IDLE_SPEED, vy: 0 };
    expect(play(right, 30).scorer).toBe("red");
    expect(right.x).toBeGreaterThanOrEqual(WIDTH - BALL_RADIUS);
  });

  it("lets a ball in that just fits between the posts", () => {
    const high = { x: 30, y: GOAL_TOP + BALL_RADIUS, vx: -IDLE_SPEED, vy: 0 };
    expect(play(high, 30).scorer).toBe("blue");

    const low = { x: 30, y: GOAL_BOTTOM - BALL_RADIUS, vx: -IDLE_SPEED, vy: 0 };
    expect(play(low, 30).scorer).toBe("blue");
  });

  it("bounces off the wall beside the goal", () => {
    const ball = { x: 30, y: GOAL_TOP - 1, vx: -IDLE_SPEED, vy: 0 };

    expect(play(ball, 15).scorer).toBeNull();
    expect(ball.vx).toBe(IDLE_SPEED);
  });

  it("is turned by a post it clips", () => {
    // Its centre is in line with the mouth, but its edge catches the top post.
    const ball = { x: 30, y: GOAL_TOP + 2, vx: -IDLE_SPEED, vy: 0 };
    play(ball, 12);

    expect(ball.vy).toBeGreaterThan(0);
  });
});

describe("a long game", () => {
  it("never leaves the table or sinks into a man", () => {
    // A fixed sequence of numbers in place of chance, so the test always plays the same.
    let seed = 20261126;
    const chance = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;

      return seed / 4294967296;
    };
    const serve = (): Ball => {
      const angle = (chance() - 0.5) * 2;
      const speed = chance() < 0.2 ? KICK_SPEED : IDLE_SPEED;

      return {
        x: WIDTH / 2,
        y: HEIGHT / 2,
        vx: Math.cos(angle) * speed * (chance() < 0.5 ? -1 : 1),
        vy: Math.sin(angle) * speed,
      };
    };

    let ball = serve();
    let goals = 0;
    let deepest = 0;
    // Ten minutes of play.
    for (let frame = 1; frame <= 36000; frame += 1) {
      const seconds = frame / 60;
      if (advanceBall(ball, 1, seconds)) {
        goals += 1;
        ball = serve();
        continue;
      }
      paceBall(ball, 1);

      expect(ball.y).toBeGreaterThanOrEqual(AT_WALL - HAIR);
      expect(ball.y).toBeLessThanOrEqual(HEIGHT - AT_WALL + HAIR);
      expect(ball.x).toBeGreaterThan(BALL_RADIUS);
      expect(ball.x).toBeLessThan(WIDTH - BALL_RADIUS);
      deepest = Math.min(deepest, gapToMen({ ...ball, seconds }));
    }

    expect(goals).toBeGreaterThan(10);
    expect(deepest).toBeGreaterThanOrEqual(-HAIR);
  });
});

describe("the ball's pace", () => {
  it("slows a kicked ball back down to idling", () => {
    const ball = { x: 160, y: 75, vx: KICK_SPEED, vy: 0 };
    paceBall(ball, 1);
    expect(Math.hypot(ball.vx, ball.vy)).toBeLessThan(KICK_SPEED);
    expect(Math.hypot(ball.vx, ball.vy)).toBeGreaterThan(IDLE_SPEED);

    for (let frame = 0; frame < 200; frame += 1) {
      paceBall(ball, 1);
    }
    expect(Math.hypot(ball.vx, ball.vy)).toBeCloseTo(IDLE_SPEED, 9);
  });

  it("keeps the ball moving along the table", () => {
    const ball = { x: 160, y: 75, vx: 0.01, vy: IDLE_SPEED };
    paceBall(ball, 1);

    expect(ball.vx).toBeGreaterThanOrEqual(0.8);
  });
});
