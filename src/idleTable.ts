// The physics of the little table that plays itself while no match is running: where the
// men and the walls are, and how the ball comes off them. Kept apart from the drawing so
// it can be tested, and so the drawing and the collisions use the very same measurements.
//
// Everything the ball can touch is tested against its drawn outline, not against a
// stand-in: the ball is a circle, a man is a rectangle with rounded corners, the table
// has rounded corners and two goal mouths with posts. The ball turns round at the moment
// its edge meets an outline, and about that outline's own direction: the flat side of a
// man sends it back along the table, the end of a man sends it back across the table,
// and a corner sends it off at whatever angle the corner is struck.

export type Team = "red" | "blue";
export type Ball = { x: number; y: number; vx: number; vy: number };

// The drawing's own units. Speeds are in units per frame at 60 frames a second.
export const WIDTH = 320;
export const HEIGHT = 150;
// How far in from the drawing's edge the table's wall is drawn, how thick that line is,
// and how round the table's corners are.
export const WALL = 6;
export const WALL_THICKNESS = 2;
export const FIELD_CORNER = 10;
export const BALL_RADIUS = 5;
// The goal mouths, in the middle of each end wall.
export const GOAL_TOP = 52;
export const GOAL_BOTTOM = 98;
// A man: a rectangle this far either side of his rod and of his own centre, with corners
// rounded to this radius.
export const MAN_HALF_WIDTH = 4;
export const MAN_HALF_HEIGHT = 9;
export const MAN_CORNER = 3;
// How far each rod's men slide either way, and how fast.
export const SLIDE = 16;
export const SLIDE_SPEED = 1.3;

export type Rod = { x: number; team: Team; men: number[]; phase: number };

// Each rod: where it crosses the table, whose it is, where its men sit, and where in its
// back-and-forth it starts, so the four don't move as one. Red defends the left goal and
// Blue the right, so a ball in the left goal is a goal for Blue.
export const RODS: Rod[] = [
  { x: 60, team: "red", men: [45, 105], phase: 0 },
  { x: 125, team: "blue", men: [35, 75, 115], phase: 1.7 },
  { x: 195, team: "red", men: [35, 75, 115], phase: 3.1 },
  { x: 260, team: "blue", men: [45, 105], phase: 4.6 },
];

export const IDLE_SPEED = 1.9;
export const KICK_SPEED = 6;
// Share of its speed a kicked ball keeps each frame, until it is back to idling.
const FRICTION = 0.985;
// Slowest the ball may travel along the table, so it never ends up bouncing straight up
// and down between two rods.
const MIN_ALONG = 0.8;
// The ball is moved in steps no longer than this and tested after each, so even a kicked
// ball in a slow frame meets a man at his surface instead of landing inside or beyond him.
const STEP = 0.5;

// The face of the wall the ball actually meets: the inner edge of the drawn line.
export const WALL_FACE = WALL + WALL_THICKNESS / 2;
// The ball's centre when it rests against the left wall, and against the top wall.
const NEAR = WALL_FACE + BALL_RADIUS;
// A rounded rectangle is a smaller plain one grown by its corner radius. These are that
// smaller one's half sizes for a man, and how close the ball's centre can come to it.
const CORE_HALF_WIDTH = MAN_HALF_WIDTH - MAN_CORNER;
const CORE_HALF_HEIGHT = MAN_HALF_HEIGHT - MAN_CORNER;
const MAN_REACH = MAN_CORNER + BALL_RADIUS;
// The table's corners likewise: the centre each one is rounded about, measured in from
// the wall's centre line, and how far from that centre the ball's own centre may stray.
const CORNER_INSET = WALL + FIELD_CORNER;
const CORNER_ROOM = FIELD_CORNER - WALL_THICKNESS / 2 - BALL_RADIUS;
// A ball counts as a goal once it is this far into the mouth: as deep as the picture has
// room to show it.
const GOAL_DEPTH = BALL_RADIUS;

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

// How far a rod's men are from their resting places at a moment, and how fast they are
// moving just then.
export const rodOffset = (rod: Rod, seconds: number): number =>
  Math.sin(seconds * SLIDE_SPEED + rod.phase) * SLIDE;

const rodSpeed = (rod: Rod, seconds: number): number =>
  (Math.cos(seconds * SLIDE_SPEED + rod.phase) * SLIDE * SLIDE_SPEED) / 60;

// The ball has sunk `depth` into something whose surface faces (nx, ny) there. Puts it
// back on the surface and, if it was heading in, turns it round about that direction. A
// surface that is itself moving (a sliding man) passes its movement on.
const bounce = (ball: Ball, nx: number, ny: number, depth: number, surfaceSpeed = 0): void => {
  ball.x += nx * depth;
  ball.y += ny * depth;

  const vy = ball.vy - surfaceSpeed;
  const inward = ball.vx * nx + vy * ny;
  if (inward < 0) {
    ball.vx -= 2 * inward * nx;
    ball.vy = vy - 2 * inward * ny + surfaceSpeed;
  }
};

const hitMen = (ball: Ball, seconds: number): void => {
  for (const rod of RODS) {
    if (Math.abs(ball.x - rod.x) >= MAN_HALF_WIDTH + BALL_RADIUS) {
      continue;
    }

    const offset = rodOffset(rod, seconds);
    for (const man of rod.men) {
      const centre = man + offset;
      // From the nearest point of the man's core to the ball's centre.
      const dx = ball.x - clamp(ball.x, rod.x - CORE_HALF_WIDTH, rod.x + CORE_HALF_WIDTH);
      const dy = ball.y - clamp(ball.y, centre - CORE_HALF_HEIGHT, centre + CORE_HALF_HEIGHT);
      const distance = Math.hypot(dx, dy);
      if (distance >= MAN_REACH) {
        continue;
      }

      if (distance === 0) {
        // Dead centre in a man, which the small steps should never allow: back out the
        // way it came.
        bounce(ball, ball.vx > 0 ? -1 : 1, 0, MAN_REACH, rodSpeed(rod, seconds));
      } else {
        bounce(ball, dx / distance, dy / distance, MAN_REACH - distance, rodSpeed(rod, seconds));
      }
    }
  }
};

// A man sliding towards a long wall can catch the ball against it: he pushes it into the
// wall and the wall pushes it back into him. Like a real pinched ball it squirts out
// sideways, along the wall, just far enough to be clear of him.
const squeezeOut = (ball: Ball, seconds: number): void => {
  for (const rod of RODS) {
    if (Math.abs(ball.x - rod.x) >= MAN_HALF_WIDTH + BALL_RADIUS) {
      continue;
    }

    const offset = rodOffset(rod, seconds);
    for (const man of rod.men) {
      const centre = man + offset;
      const dx = ball.x - clamp(ball.x, rod.x - CORE_HALF_WIDTH, rod.x + CORE_HALF_WIDTH);
      const dy = ball.y - clamp(ball.y, centre - CORE_HALF_HEIGHT, centre + CORE_HALF_HEIGHT);
      if (Math.hypot(dx, dy) >= MAN_REACH) {
        continue;
      }

      // To whichever side of the rod it already is, or is heading.
      const side = ball.x === rod.x ? (ball.vx < 0 ? -1 : 1) : ball.x < rod.x ? -1 : 1;
      ball.x = rod.x + side * (CORE_HALF_WIDTH + Math.sqrt(MAN_REACH ** 2 - dy ** 2));
      ball.vx = side * Math.abs(ball.vx);
    }
  }
};

// Keeps the ball inside the table. Returns the team that scored if it went in a goal.
const hitWalls = (ball: Ball): Team | null => {
  const left = ball.x < WIDTH / 2;
  const top = ball.y < HEIGHT / 2;

  // In one of the table's rounded corners.
  const cornerX = left ? CORNER_INSET : WIDTH - CORNER_INSET;
  const cornerY = top ? CORNER_INSET : HEIGHT - CORNER_INSET;
  if ((left ? ball.x < cornerX : ball.x > cornerX) && (top ? ball.y < cornerY : ball.y > cornerY)) {
    const dx = cornerX - ball.x;
    const dy = cornerY - ball.y;
    const distance = Math.hypot(dx, dy);
    if (distance > CORNER_ROOM) {
      bounce(ball, dx / distance, dy / distance, distance - CORNER_ROOM);
    }

    return null;
  }

  // The long walls.
  if (ball.y < NEAR) {
    bounce(ball, 0, 1, NEAR - ball.y);
  } else if (ball.y > HEIGHT - NEAR) {
    bounce(ball, 0, -1, ball.y - (HEIGHT - NEAR));
  }

  // The end walls.
  const sunk = left ? NEAR - ball.x : ball.x - (WIDTH - NEAR);
  if (sunk <= 0) {
    return null;
  }

  // Beside the goal the wall is solid.
  if (ball.y <= GOAL_TOP || ball.y >= GOAL_BOTTOM) {
    bounce(ball, left ? 1 : -1, 0, sunk);

    return null;
  }

  // In front of the mouth only the two posts are in the way: the ends of the wall.
  const face = left ? WALL_FACE : WIDTH - WALL_FACE;
  for (const post of [GOAL_TOP, GOAL_BOTTOM]) {
    const dx = ball.x - face;
    const dy = ball.y - post;
    const distance = Math.hypot(dx, dy);
    if (distance > 0 && distance < BALL_RADIUS) {
      bounce(ball, dx / distance, dy / distance, BALL_RADIUS - distance);
    }
  }

  if (left ? ball.x <= GOAL_DEPTH : ball.x >= WIDTH - GOAL_DEPTH) {
    return left ? "blue" : "red";
  }

  return null;
};

// Moves the ball on by `frames` frames, ending at the moment `seconds` (which decides
// where the sliding men are). Returns the team that scored, if the ball went in a goal;
// the ball is then left where it crossed the line.
export const advanceBall = (ball: Ball, frames: number, seconds: number): Team | null => {
  const steps = Math.max(1, Math.ceil((Math.hypot(ball.vx, ball.vy) * frames) / STEP));
  const each = frames / steps;

  for (let step = 1; step <= steps; step += 1) {
    ball.x += ball.vx * each;
    ball.y += ball.vy * each;

    const moment = seconds - ((steps - step) * each) / 60;
    hitMen(ball, moment);
    const scorer = hitWalls(ball);
    if (scorer) {
      return scorer;
    }
    // Only matters if the wall has just pushed the ball back into a man.
    squeezeOut(ball, moment);
  }

  return null;
};

// Brings the ball's speed back to its idle pace: a kicked ball slows down to it, and a
// ball a man has slowed or sped up is put back on it.
export const paceBall = (ball: Ball, frames: number): void => {
  const speed = Math.hypot(ball.vx, ball.vy) || IDLE_SPEED;
  const target = speed > IDLE_SPEED ? Math.max(IDLE_SPEED, speed * FRICTION ** frames) : IDLE_SPEED;
  ball.vx *= target / speed;
  ball.vy *= target / speed;
  if (Math.abs(ball.vx) < MIN_ALONG) {
    ball.vx = ball.vx < 0 ? -MIN_ALONG : MIN_ALONG;
  }
};
