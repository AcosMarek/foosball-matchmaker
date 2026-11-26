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
  ROD_MAX_SPEED,
  SLIDE,
  WIDTH,
  advanceBall,
  paceBall,
  restingRods,
  slideRods,
  steerRods,
  type Ball,
  type RodState,
  type Team,
} from "./idleTable";

// Rounding left over from the arithmetic; anything bigger is a real overlap.
const HAIR = 1e-9;
// Where the ball's centre is when its edge touches the inside of a wall.
const AT_WALL = 7 + BALL_RADIUS;
// How close to a man's centre, across the table, the ball's centre passes and still
// touches him.
const WITHIN_REACH = MAN_HALF_HEIGHT + BALL_RADIUS;

// Rods that stay where they are put, for testing the ball on its own.
const parked = (offsets: number[] = [0, 0, 0, 0]): RodState[] =>
  offsets.map((offset) => ({
    offset,
    speed: 0,
    target: offset,
    mode: "wander",
    wish: offset,
    stroll: Infinity,
    rethink: 0,
    heading: 0,
    aim: 0,
    attention: 0,
  }));

// A fixed sequence of numbers in place of chance, so a test always plays the same.
const sequence = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;

  return seed / 4294967296;
};

// Plays the ball on, a frame (or `perCall` frames) at a time, and records where it was
// after each. Stops if a goal is scored.
const play = (ball: Ball, rods: RodState[], frames: number, perCall = 1) => {
  const path: Ball[] = [];
  let scorer: Team | null = null;

  for (let frame = 0; frame < frames && !scorer; frame += 1) {
    scorer = advanceBall(ball, rods, perCall);
    path.push({ ...ball });
  }

  return { path, scorer };
};

// How far the ball's edge is from the outline of the nearest man: the men are rounded
// rectangles, so this is measured to the rounded outline. Negative means overlapping.
const gapToMen = ({ x, y }: Ball, rods: RodState[]): number =>
  Math.min(
    ...RODS.flatMap((rod, index) =>
      rod.men.map((man) => {
        const centre = man + rods[index].offset;
        const dx = Math.max(0, Math.abs(x - rod.x) - (MAN_HALF_WIDTH - MAN_CORNER));
        const dy = Math.max(0, Math.abs(y - centre) - (MAN_HALF_HEIGHT - MAN_CORNER));

        return Math.hypot(dx, dy) - MAN_CORNER - BALL_RADIUS;
      }),
    ),
  );

// How far across the table the nearest man of a rod is from `y`.
const nearestMan = (index: number, rods: RodState[], y: number): number =>
  Math.min(...RODS[index].men.map((man) => Math.abs(y - (man + rods[index].offset))));

// Rolls the ball on in a straight line, touching nothing, while the rods watch it.
const watch = (ball: Ball, rods: RodState[], frames: number, random: () => number) => {
  for (let frame = 0; frame < frames; frame += 1) {
    ball.x += ball.vx;
    ball.y += ball.vy;
    steerRods(rods, ball, 1, random);
    slideRods(rods, 1);
  }
};

const defender = RODS[0];

describe("the ball against a man", () => {
  it("comes straight back off the flat side of a man, at the moment they touch", () => {
    const ball = { x: 35, y: 45, vx: IDLE_SPEED, vy: 0 };
    const { path } = play(ball, parked(), 20);
    const face = defender.x - MAN_HALF_WIDTH;

    expect(ball.vx).toBe(-IDLE_SPEED);
    expect(ball.vy).toBe(0);
    // Its edge reached the man's side and never went past it.
    const furthest = Math.max(...path.map((point) => point.x + BALL_RADIUS));
    expect(furthest).toBeLessThanOrEqual(face + HAIR);
    expect(furthest).toBeGreaterThan(face - IDLE_SPEED);
  });

  it("comes back across the table off the end of a man, not back along it", () => {
    const rods = parked();
    const ball = { x: defender.x, y: 14, vx: 0, vy: IDLE_SPEED };
    const { path } = play(ball, rods, 14);

    expect(ball.vx).toBeCloseTo(0, 12);
    expect(ball.vy).toBe(-IDLE_SPEED);
    expect(Math.min(...path.map((point) => gapToMen(point, rods)))).toBeGreaterThanOrEqual(-HAIR);
  });

  it("keeps travelling along the table when it clips the end of a man in passing", () => {
    // Heading right and down, onto the top end of the man from above.
    const ball = { x: 50, y: 20, vx: 1.2, vy: 1.45 };
    play(ball, parked(), 14);

    expect(ball.vx).toBeGreaterThan(0);
    expect(ball.vy).toBeLessThan(0);
  });

  it("comes off a rounded corner at an angle", () => {
    // Diagonally, square onto the top-left corner of the man.
    const ball = { x: 42.6, y: 22.6, vx: 1.3435, vy: 1.3435 };
    play(ball, parked(), 16);

    // Back the way it came, which neither a flat side nor a flat end would do.
    expect(ball.vx).toBeCloseTo(-1.3435, 1);
    expect(ball.vy).toBeCloseTo(-1.3435, 1);
  });

  it("does not pass through a man when kicked, even in slow frames", () => {
    const rods = parked();
    const ball = { x: 30, y: 45, vx: KICK_SPEED, vy: 0 };
    const { path } = play(ball, rods, 3, 3);

    expect(ball.vx).toBe(-KICK_SPEED);
    expect(Math.max(...path.map((point) => point.x))).toBeLessThan(defender.x);
    expect(Math.min(...path.map((point) => gapToMen(point, rods)))).toBeGreaterThanOrEqual(-HAIR);
  });

  it("is carried along by a man that is moving when they meet", () => {
    // The ball comes down onto the end of a man who is sliding away from it...
    const retreating = parked();
    Object.assign(retreating[0], { speed: 0.5, target: SLIDE });
    const soft = { x: defender.x, y: 14, vx: 0, vy: IDLE_SPEED };
    play(soft, retreating, 30);
    expect(soft.vy).toBeLessThan(0);
    expect(Math.abs(soft.vy)).toBeLessThan(IDLE_SPEED);

    // ...and onto one who is sliding towards it.
    const advancing = parked([SLIDE, 0, 0, 0]);
    Object.assign(advancing[0], { speed: -0.5, target: -SLIDE });
    const hard = { x: defender.x, y: 14, vx: 0, vy: IDLE_SPEED };
    play(hard, advancing, 17);
    expect(hard.vy).toBeLessThan(-IDLE_SPEED);
  });

  it("squirts out sideways when a man pins it against the long wall", () => {
    // Resting against the top wall, just right of the second rod, as that rod's top man
    // slides up to within a few units of the wall.
    const rod = RODS[1];
    const rods = parked([0, -4, 0, 0]);
    Object.assign(rods[1], { speed: -0.5, target: -SLIDE });
    const ball = { x: rod.x + 1, y: AT_WALL, vx: 0, vy: 0 };

    for (let frame = 0; frame < 60; frame += 1) {
      advanceBall(ball, rods, 1);

      expect(gapToMen(ball, rods)).toBeGreaterThanOrEqual(-HAIR);
      expect(ball.y).toBeGreaterThanOrEqual(AT_WALL - HAIR);
    }

    expect(rods[1].offset).toBeLessThan(-SLIDE + 1);
    expect(ball.x).toBeGreaterThan(rod.x + MAN_HALF_WIDTH);
  });
});

describe("the ball against the table", () => {
  it("turns round when its edge meets an end wall", () => {
    const ball = { x: 30, y: 30, vx: -IDLE_SPEED, vy: 0 };
    const { path, scorer } = play(ball, parked(), 15);

    expect(scorer).toBeNull();
    expect(ball.vx).toBe(IDLE_SPEED);
    expect(ball.vy).toBe(0);
    const nearest = Math.min(...path.map((point) => point.x));
    expect(nearest).toBeGreaterThanOrEqual(AT_WALL - HAIR);
    expect(nearest).toBeLessThan(AT_WALL + IDLE_SPEED);
  });

  it("turns round when its edge meets a long wall", () => {
    const ball = { x: 92, y: 30, vx: 0, vy: -IDLE_SPEED };
    const { path } = play(ball, parked(), 15);

    expect(ball.vx).toBe(0);
    expect(ball.vy).toBe(IDLE_SPEED);
    expect(Math.min(...path.map((point) => point.y))).toBeGreaterThanOrEqual(AT_WALL - HAIR);
  });

  it("follows the round of the table's corners", () => {
    const ball = { x: 32, y: 32, vx: -1.34, vy: -1.34 };
    const { path } = play(ball, parked(), 30);

    expect(ball.vx).toBeGreaterThan(0);
    expect(ball.vy).toBeGreaterThan(0);
    // The corner is rounded about (16, 16); the ball's centre can be 4 from there.
    for (const point of path.filter((point) => point.x < 16 && point.y < 16)) {
      expect(Math.hypot(point.x - 16, point.y - 16)).toBeLessThanOrEqual(4 + HAIR);
    }
  });

  it("scores for Blue in the left goal and for Red in the right", () => {
    const left = { x: 30, y: 75, vx: -IDLE_SPEED, vy: 0 };
    expect(play(left, parked(), 30).scorer).toBe("blue");
    expect(left.x).toBeLessThanOrEqual(BALL_RADIUS);

    const right = { x: WIDTH - 30, y: 75, vx: IDLE_SPEED, vy: 0 };
    expect(play(right, parked(), 30).scorer).toBe("red");
    expect(right.x).toBeGreaterThanOrEqual(WIDTH - BALL_RADIUS);
  });

  it("lets a ball in that just fits between the posts", () => {
    const high = { x: 30, y: GOAL_TOP + BALL_RADIUS, vx: -IDLE_SPEED, vy: 0 };
    expect(play(high, parked(), 30).scorer).toBe("blue");

    const low = { x: 30, y: GOAL_BOTTOM - BALL_RADIUS, vx: -IDLE_SPEED, vy: 0 };
    expect(play(low, parked(), 30).scorer).toBe("blue");
  });

  it("bounces off the wall beside the goal", () => {
    const ball = { x: 30, y: GOAL_TOP - 1, vx: -IDLE_SPEED, vy: 0 };

    expect(play(ball, parked(), 15).scorer).toBeNull();
    expect(ball.vx).toBe(IDLE_SPEED);
  });

  it("is turned by a post it clips", () => {
    // Its centre is in line with the mouth, but its edge catches the top post.
    const ball = { x: 30, y: GOAL_TOP + 2, vx: -IDLE_SPEED, vy: 0 };
    play(ball, parked(), 12);

    expect(ball.vy).toBeGreaterThan(0);
  });
});

describe("the rods", () => {
  // Chance that always comes up low: every rod notices every ball, and reacts at once.
  const alert = () => 0;
  // Chance that always comes up high: no rod ever notices.
  const dozy = () => 0.999;

  it("line a man up with a ball heading for their own goal", () => {
    // Rolling left down the middle, towards Red's goal, from beyond Red's forwards.
    const ball = { x: 250, y: 75, vx: -IDLE_SPEED, vy: 0 };
    const rods = restingRods(alert);
    watch(ball, rods, 20, alert);

    expect(rods[2].mode).toBe("block");
    expect(nearestMan(2, rods, 75)).toBeLessThan(WITHIN_REACH);
  });

  it("get out of the way of a ball coming from behind", () => {
    // The same ball is on its way to Blue's forwards from behind them: if one of them
    // touched it, it would go back towards Blue's own goal. Their middle man starts
    // right in its path.
    const ball = { x: 250, y: 75, vx: -IDLE_SPEED, vy: 0 };
    const rods = restingRods(alert);
    expect(nearestMan(1, rods, 75)).toBe(0);
    watch(ball, rods, 55, alert);

    expect(rods[1].mode).toBe("dodge");
    expect(nearestMan(1, rods, 75)).toBeGreaterThan(WITHIN_REACH);
  });

  it("move the back row aside for a ball coming back off its own end wall", () => {
    const ball = { x: 14, y: 45, vx: IDLE_SPEED, vy: 0 };
    const rods = restingRods(alert);
    watch(ball, rods, 12, alert);

    expect(rods[0].mode).toBe("dodge");
    // Already on the move, away from where the ball will pass.
    expect(Math.abs(rods[0].offset)).toBeGreaterThan(1);
    expect(Math.sign(rods[0].speed)).toBe(Math.sign(rods[0].offset));
  });

  it("clear the whole path of a ball that crosses at a slant", () => {
    // Coming off the end wall behind Red's back row on a slant: where it would be as it
    // crossed the rod itself is clear of the upper man, but it reaches him sooner than
    // that, and higher up, where he is standing.
    const ball = { x: 20, y: 15, vx: 1.2, vy: 1.45 };
    const rods = restingRods(alert);
    watch(ball, rods, 24, alert);

    // It is now about to reach the men. Roll it on past them and see that it touches
    // none, with the rod left to finish what it was doing.
    for (let frame = 0; frame < 22; frame += 1) {
      ball.x += ball.vx;
      ball.y += ball.vy;
      slideRods(rods, 1);
      expect(gapToMen(ball, rods)).toBeGreaterThan(0);
    }
    expect(ball.x).toBeGreaterThan(defender.x + MAN_HALF_WIDTH + BALL_RADIUS);
  });

  it("drift off again if the ball takes too long to arrive", () => {
    // A ball dawdling towards Red's forwards.
    const ball = { x: 300, y: 75, vx: -0.5, vy: 0 };
    const rods = restingRods(alert);
    watch(ball, rods, 30, alert);
    expect(rods[2].mode).toBe("block");

    watch(ball, rods, 60, alert);
    expect(ball.x).toBeGreaterThan(RODS[2].x);
    expect(rods[2].mode).toBe("wander");
  });

  it("lose interest once the ball has gone past", () => {
    const ball = { x: 250, y: 75, vx: -IDLE_SPEED, vy: 0 };
    const rods = restingRods(alert);
    watch(ball, rods, 20, alert);
    expect(rods[2].mode).toBe("block");

    // On past Red's forwards, at 195.
    watch(ball, rods, 20, alert);
    expect(ball.x).toBeLessThan(RODS[2].x);
    expect(rods[2].mode).toBe("wander");
  });

  it("just wander when they are not paying attention, or there is no ball", () => {
    const ball = { x: 250, y: 75, vx: -IDLE_SPEED, vy: 0 };
    const rods = restingRods(dozy);
    watch(ball, rods, 40, dozy);
    expect(rods.map((rod) => rod.mode)).toEqual(["wander", "wander", "wander", "wander"]);

    const idle = restingRods(alert);
    for (let frame = 0; frame < 200; frame += 1) {
      steerRods(idle, null, 1, alert);
      slideRods(idle, 1);
    }
    expect(idle.map((rod) => rod.mode)).toEqual(["wander", "wander", "wander", "wander"]);
  });

  it("never slide their men out of reach of the table, and never jerk", () => {
    const random = sequence(7);
    const rods = restingRods(random);
    const ball = { x: WIDTH / 2, y: HEIGHT / 2, vx: IDLE_SPEED, vy: 0.3 };
    let moved = 0;

    for (let frame = 0; frame < 20000; frame += 1) {
      // A ball that keeps changing its mind, to keep the rods busy.
      if (frame % 45 === 0) {
        ball.x = 20 + random() * (WIDTH - 40);
        ball.y = 20 + random() * (HEIGHT - 40);
        ball.vx = random() < 0.5 ? -IDLE_SPEED : IDLE_SPEED;
      }
      const before = rods.map((rod) => rod.offset);
      steerRods(rods, ball, 1, random);
      slideRods(rods, 1);

      rods.forEach((rod, index) => {
        expect(Math.abs(rod.offset)).toBeLessThanOrEqual(SLIDE);
        expect(Math.abs(rod.offset - before[index])).toBeLessThanOrEqual(ROD_MAX_SPEED + HAIR);
        moved += Math.abs(rod.offset - before[index]);
      });
    }

    // And they do keep moving.
    expect(moved).toBeGreaterThan(1000);
  });
});

describe("a long game", () => {
  const game = (seed: number, frames: number) => {
    const random = sequence(seed);
    const serve = (): Ball => {
      const angle = (random() - 0.5) * 2;
      const speed = random() < 0.2 ? KICK_SPEED : IDLE_SPEED;

      return {
        x: WIDTH / 2,
        y: HEIGHT / 2,
        vx: Math.cos(angle) * speed * (random() < 0.5 ? -1 : 1),
        vy: Math.sin(angle) * speed,
      };
    };

    const rods = restingRods(random);
    let ball = serve();
    const goals = { red: 0, blue: 0 };
    let deepest = 0;
    let strayed = false;
    let waited = 0;
    let longestWait = 0;

    for (let frame = 0; frame < frames; frame += 1) {
      steerRods(rods, ball, 1, random);
      const scorer = advanceBall(ball, rods, 1);
      waited += 1;
      longestWait = Math.max(longestWait, waited);
      if (scorer) {
        goals[scorer] += 1;
        waited = 0;
        ball = serve();
        continue;
      }
      paceBall(ball, 1);

      strayed ||=
        ball.y < AT_WALL - HAIR ||
        ball.y > HEIGHT - AT_WALL + HAIR ||
        ball.x <= BALL_RADIUS ||
        ball.x >= WIDTH - BALL_RADIUS;
      deepest = Math.min(deepest, gapToMen(ball, rods));
    }

    return { goals, deepest, strayed, longestWait, ball, rods };
  };

  it("never leaves the table or sinks into a man", () => {
    // Half an hour of play.
    const { goals, deepest, strayed, longestWait } = game(20261126, 108000);

    expect(strayed).toBe(false);
    expect(deepest).toBeGreaterThanOrEqual(-HAIR);
    // Both sides score, and often enough to be worth watching: a goal every half minute
    // or better on the whole, and the ball never stuck anywhere for minutes on end.
    expect(goals.red).toBeGreaterThan(10);
    expect(goals.blue).toBeGreaterThan(10);
    expect(goals.red + goals.blue).toBeGreaterThan(60);
    expect(longestWait).toBeLessThan(3 * 60 * 60);
  });

  it("plays out the same way given the same chances", () => {
    const first = game(42, 3000);
    const second = game(42, 3000);

    expect(second.ball).toEqual(first.ball);
    expect(second.rods).toEqual(first.rods);
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
