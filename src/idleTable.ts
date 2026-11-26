// The physics of the little table that plays itself while no match is running: where the
// men and the walls are, how the rods move, and how the ball comes off everything. Kept
// apart from the drawing so it can be tested, and so the drawing and the collisions use
// the very same measurements.
//
// Everything the ball can touch is tested against its drawn outline, not against a
// stand-in: the ball is a circle, a man is a rectangle with rounded corners, the table
// has rounded corners and two goal mouths with posts. The ball turns round at the moment
// its edge meets an outline, and about that outline's own direction: the flat side of a
// man sends it back along the table, the end of a man sends it back across the table,
// and a corner sends it off at whatever angle the corner is struck.
//
// The rods are moved as if by four absent-minded players. Mostly each one wanders: it
// picks somewhere to slide to, eases over, and picks again. But when the ball is on its
// way to a rod, that rod may be paying attention. If the ball is heading for the rod's
// own goal it lines a man up with where the ball will arrive. If the ball is coming from
// behind, on its way to the other goal, it gets its men out of the way, because a man
// only ever sends the ball back where it came from and that would be towards his own
// goal. It is a lean, not a rule: the rods are slow, they aim a little off, and often
// they are not paying attention at all, so the men miss, and now and then score for the
// other side.

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
// How far each rod's men can slide either way from where they rest.
export const SLIDE = 16;

export type Rod = { x: number; team: Team; men: number[] };

// Each rod: where it crosses the table, whose it is, and where its men rest. Red defends
// the left goal and Blue the right, so a ball in the left goal is a goal for Blue.
export const RODS: Rod[] = [
  { x: 60, team: "red", men: [45, 105] },
  { x: 125, team: "blue", men: [35, 75, 115] },
  { x: 195, team: "red", men: [35, 75, 115] },
  { x: 260, team: "blue", men: [45, 105] },
];

// What a rod is doing: sliding about for no reason, lining a man up with a ball that is
// heading for its own goal, or keeping its men clear of a ball coming from behind.
export type RodMode = "wander" | "block" | "dodge";

// One rod at a moment, in the same order as RODS.
export type RodState = {
  // How far its men are from where they rest, and how fast that is changing.
  offset: number;
  speed: number;
  // Where it is sliding to.
  target: number;
  mode: RodMode;
  // Where it would drift to if left to itself, and the frames until it next changes its
  // mind about that. Every rod keeps wandering, whatever else it is doing.
  wish: number;
  stroll: number;
  // Frames until a rod that is watching the ball next adjusts to it.
  rethink: number;
  // Which way along the table a ball on its way to this rod was last seen travelling:
  // -1 left, 1 right, 0 when no ball is on its way.
  heading: number;
  // How far off its aim is this time, so that even an attentive rod sometimes misses.
  aim: number;
  // Frames for which it will go on paying attention to the ball it has noticed.
  attention: number;
};

export const IDLE_SPEED = 2.1;
export const KICK_SPEED = 6;
// Share of its speed a kicked ball keeps each frame, until it is back to idling.
const FRICTION = 0.985;
// Slowest the ball may travel along the table, so it never ends up bouncing straight up
// and down between two rods.
const MIN_ALONG = 0.8;
// The ball is moved in steps no longer than this and tested after each, so even a kicked
// ball in a slow frame meets a man at his surface instead of landing inside or beyond him.
const STEP = 0.5;

// How a rod moves. It heads for its target at up to ROD_MAX_SPEED, slowing as it nears
// (ROD_EASE is the share of the remaining distance it would cover in a frame), and can
// change its speed by no more than ROD_ACCEL a frame, so it never jerks.
export const ROD_MAX_SPEED = 0.8;
const ROD_EASE = 0.15;
const ROD_ACCEL = 0.08;
// Every rod thinks of a new place to drift to every so often (in frames), and some of
// those times just stays where it is.
const WANDER_MIN = 24;
const WANDER_SPREAD = 56;
const REST_CHANCE = 0.15;
// How often a rod notices a ball on its way: one heading for its own goal, and one coming
// from behind. Getting out of the way is the easier thing to remember.
const BLOCK_CHANCE = 0.3;
const DODGE_CHANCE = 0.9;
// A rod that has noticed takes this long to start moving, then adjusts this often.
const REACTION_MIN = 4;
const REACTION_SPREAD = 10;
const TRACK_EVERY = 8;
// How far off, either way, a rod's idea of where the ball will arrive can be.
const AIM_ERROR = 7;
// How long (in frames) a rod keeps its mind on one ball before it drifts off again. A
// ball can bounce to and fro behind a rod for a while; no rod holds a pose for ever.
const ATTENTION_MIN = 60;
const ATTENTION_SPREAD = 90;

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
// How far from a man's centre, across the table, the ball's centre must pass to miss him,
// with a little to spare.
const CLEAR_OF_MAN = MAN_HALF_HEIGHT + BALL_RADIUS + 3;
// How far either side of a rod, along the table, the ball can be and still touch its men.
const ROD_DEPTH = MAN_HALF_WIDTH + BALL_RADIUS;

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

// --- The rods ---

// Four rods at rest, each about to decide where to go.
export const restingRods = (random: () => number = Math.random): RodState[] =>
  RODS.map(() => ({
    offset: 0,
    speed: 0,
    target: 0,
    mode: "wander",
    wish: 0,
    stroll: random() * WANDER_MIN,
    rethink: 0,
    heading: 0,
    aim: 0,
    attention: 0,
  }));

// Where across the table the ball will be once it has travelled `distance` further along
// it, going by how it is moving now and allowing for the long walls. It may of course
// meet a man first.
const crossingAfter = (ball: Ball, distance: number): number => {
  const span = HEIGHT - 2 * NEAR;
  const straight = ball.y + (ball.vy * distance) / Math.abs(ball.vx) - NEAR;
  const folded = ((straight % (2 * span)) + 2 * span) % (2 * span);

  return NEAR + (folded > span ? 2 * span - folded : folded);
};

// What the ball is to a rod: on its way, or of no interest. If it is on its way: which
// way along the table it will be travelling when it arrives (-1 left, 1 right), and where
// across the table it will be as it reaches the rod's men (`from`) and as it leaves them
// (`to`). A ball crossing at a slant covers some ground between the two.
type Approach = { heading: number; from: number; to: number };

const approach = (ball: Ball, index: number): Approach | null => {
  if (ball.vx === 0) {
    return null;
  }

  const rod = RODS[index];
  const arriving = (heading: number, distance: number): Approach => ({
    heading,
    from: crossingAfter(ball, Math.max(0, distance - ROD_DEPTH)),
    to: crossingAfter(ball, distance + ROD_DEPTH),
  });

  if ((rod.x - ball.x) * ball.vx > 0) {
    return arriving(Math.sign(ball.vx), Math.abs(rod.x - ball.x));
  }

  // Going away. But a back row knows that a ball which has gone past it will be back in a
  // moment, off the end wall behind it, unless it goes in. That return is the ball coming
  // from behind, and there is little time to get out of its way once it has turned, so
  // the back row starts as soon as the ball is past.
  const wall = index === 0 ? NEAR : index === RODS.length - 1 ? WIDTH - NEAR : null;
  if (wall !== null && (wall - rod.x) * ball.vx > 0) {
    return arriving(-Math.sign(ball.vx), Math.abs(wall - ball.x) + Math.abs(wall - rod.x));
  }

  return null;
};

// Where to slide to so that one of the rod's men stands at `y`: whichever man can get
// closest to it, and of those the one that has least far to go.
const offsetToBlock = (rod: Rod, state: RodState, y: number): number => {
  let best = state.offset;
  let bestCost = Infinity;
  for (const man of rod.men) {
    const offset = clamp(y - man, -SLIDE, SLIDE);
    const cost = Math.abs(y - man - offset) * 4 + Math.abs(offset - state.offset);
    if (cost < bestCost) {
      best = offset;
      bestCost = cost;
    }
  }

  return best;
};

// Where to slide to so that none of the rod's men stands anywhere between `low` and
// `high`. First the nearest place that leaves the ball room to pass, or failing that the
// place that leaves most. From there the rod is free to drift on towards where it wished
// to be, for as long as that still leaves room: it does not stand to attention, and it
// does not carry a man across the ball's path to get to the other side of it.
const offsetToDodge = (rod: Rod, state: RodState, low: number, high: number): number => {
  const roomAt = (offset: number): number =>
    Math.min(...rod.men.map((man) => Math.max(low - (man + offset), man + offset - high, 0)));

  let best = state.offset;
  let bestScore = -Infinity;
  for (let offset = -SLIDE; offset <= SLIDE; offset += 2) {
    const score = Math.min(roomAt(offset), CLEAR_OF_MAN) - Math.abs(offset - state.offset) * 0.02;
    if (score > bestScore) {
      best = offset;
      bestScore = score;
    }
  }

  const towards = Math.sign(state.wish - best);
  while (
    towards !== 0 &&
    Math.abs(state.wish - best) >= 2 &&
    Math.abs(best + towards * 2) <= SLIDE &&
    roomAt(best + towards * 2) >= CLEAR_OF_MAN
  ) {
    best += towards * 2;
  }

  return best;
};

// Lets each rod decide where it wants to be. `ball` is the ball in play, or null while
// there is none (after a goal). This only chooses targets; the rods are moved by
// advanceBall, or by slideRods when no ball is in play.
export const steerRods = (
  rods: RodState[],
  ball: Ball | null,
  frames: number,
  random: () => number = Math.random,
): void => {
  RODS.forEach((rod, index) => {
    const state = rods[index];
    // Only a ball that is on its way to this rod is of any interest to it.
    const coming = ball === null ? null : approach(ball, index);
    const heading = coming?.heading ?? 0;

    if (heading !== state.heading) {
      state.heading = heading;
      state.mode = "wander";
      if (heading !== 0) {
        // Red's goal is on the left, Blue's on the right.
        const atOwnGoal = rod.team === "red" ? heading < 0 : heading > 0;
        if (random() < (atOwnGoal ? BLOCK_CHANCE : DODGE_CHANCE)) {
          state.mode = atOwnGoal ? "block" : "dodge";
          state.aim = (random() - 0.5) * 2 * AIM_ERROR;
          state.attention = ATTENTION_MIN + random() * ATTENTION_SPREAD;
          state.rethink = REACTION_MIN + random() * REACTION_SPREAD;
        }
      }
    }

    state.attention -= frames;
    if (state.attention <= 0) {
      state.mode = "wander";
    }

    // Every so often it thinks of somewhere new to drift to, or decides to stay put.
    state.stroll -= frames;
    if (state.stroll <= 0) {
      state.stroll = WANDER_MIN + random() * WANDER_SPREAD;
      state.wish = random() < REST_CHANCE ? state.offset : (random() * 2 - 1) * SLIDE;
    }

    if (state.mode === "wander" || coming === null) {
      state.target = state.wish;

      return;
    }

    state.rethink -= frames;
    if (state.rethink > 0) {
      return;
    }

    state.rethink = TRACK_EVERY;
    state.target =
      state.mode === "block"
        ? offsetToBlock(rod, state, coming.from + state.aim)
        : offsetToDodge(rod, state, Math.min(coming.from, coming.to), Math.max(coming.from, coming.to));
  });
};

// Moves every rod towards where it wants to be.
export const slideRods = (rods: RodState[], frames: number): void => {
  // In steps of a frame at most, so a long frame eases the same way as short ones.
  const steps = Math.max(1, Math.ceil(frames));
  const each = frames / steps;

  for (let step = 0; step < steps; step += 1) {
    for (const state of rods) {
      const wanted = clamp((state.target - state.offset) * ROD_EASE, -ROD_MAX_SPEED, ROD_MAX_SPEED);
      state.speed += clamp(wanted - state.speed, -ROD_ACCEL * each, ROD_ACCEL * each);
      state.offset += state.speed * each;

      // The men stop at the end of their travel, well short of the walls.
      if (Math.abs(state.offset) > SLIDE) {
        state.offset = Math.sign(state.offset) * SLIDE;
        state.speed = 0;
      }
    }
  }
};

// --- The ball ---

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

// Calls `touch` for every man the ball overlaps, with the line from the nearest point of
// the man's core to the ball's centre.
const eachManTouched = (
  ball: Ball,
  rods: RodState[],
  touch: (rod: Rod, state: RodState, dx: number, dy: number, distance: number) => void,
): void => {
  RODS.forEach((rod, index) => {
    if (Math.abs(ball.x - rod.x) >= MAN_HALF_WIDTH + BALL_RADIUS) {
      return;
    }

    const state = rods[index];
    for (const man of rod.men) {
      const centre = man + state.offset;
      const dx = ball.x - clamp(ball.x, rod.x - CORE_HALF_WIDTH, rod.x + CORE_HALF_WIDTH);
      const dy = ball.y - clamp(ball.y, centre - CORE_HALF_HEIGHT, centre + CORE_HALF_HEIGHT);
      const distance = Math.hypot(dx, dy);
      if (distance < MAN_REACH) {
        touch(rod, state, dx, dy, distance);
      }
    }
  });
};

const hitMen = (ball: Ball, rods: RodState[]): void =>
  eachManTouched(ball, rods, (_rod, state, dx, dy, distance) => {
    if (distance === 0) {
      // Dead centre in a man, which the small steps should never allow: back out the way
      // it came.
      bounce(ball, ball.vx > 0 ? -1 : 1, 0, MAN_REACH, state.speed);
    } else {
      bounce(ball, dx / distance, dy / distance, MAN_REACH - distance, state.speed);
    }
  });

// A man sliding towards a long wall can catch the ball against it: he pushes it into the
// wall and the wall pushes it back into him. Like a real pinched ball it squirts out
// sideways, along the wall, just far enough to be clear of him.
const squeezeOut = (ball: Ball, rods: RodState[]): void =>
  eachManTouched(ball, rods, (rod, _state, _dx, dy) => {
    // To whichever side of the rod it already is, or is heading.
    const side = ball.x === rod.x ? (ball.vx < 0 ? -1 : 1) : ball.x < rod.x ? -1 : 1;
    ball.x = rod.x + side * (CORE_HALF_WIDTH + Math.sqrt(MAN_REACH ** 2 - dy ** 2));
    ball.vx = side * Math.abs(ball.vx);
  });

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

// Moves the ball, and the rods with it, on by `frames` frames. Returns the team that
// scored, if the ball went in a goal; the ball is then left where it crossed the line.
export const advanceBall = (ball: Ball, rods: RodState[], frames: number): Team | null => {
  const steps = Math.max(1, Math.ceil((Math.hypot(ball.vx, ball.vy) * frames) / STEP));
  const each = frames / steps;

  for (let step = 0; step < steps; step += 1) {
    slideRods(rods, each);
    ball.x += ball.vx * each;
    ball.y += ball.vy * each;

    hitMen(ball, rods);
    const scorer = hitWalls(ball);
    if (scorer) {
      // The rods finish the frame too, so they don't lose time whenever a goal is scored.
      slideRods(rods, each * (steps - step - 1));

      return scorer;
    }
    // Only matters if the wall has just pushed the ball back into a man.
    squeezeOut(ball, rods);
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
