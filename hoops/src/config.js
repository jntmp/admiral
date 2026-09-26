// World units are metres. The hoop sits at the origin of the court's x/z plane,
// facing +z; the shooter always stands somewhere at z > 0.

export const GRAVITY = 9.81;

export const BALL_RADIUS = 0.12;

export const RIM = {
  y: 3.05,
  radius: 0.25, // a touch wider than regulation (0.2286) to keep it casual
  tube: 0.02,
};

export const NET = {
  depth: 0.42,
  bottomRadius: 0.16,
};

export const BOARD = {
  width: 1.8,
  height: 1.05,
  thickness: 0.05,
  bottom: 2.9,
  front: -0.375, // z of the face the ball hits
};

export const POLE = { z: -2.35, radius: 0.14, height: 3.6 };

export const COURT = {
  baseline: -1.575,
  halfWidth: 7.5,
  threeRadius: 6.75,
  threeCornerX: 6.6,
  keyHalfWidth: 2.45,
  freeThrow: 4.225, // free-throw line distance from the rim centre
};

// Where the ball is released, relative to the floor.
export const RELEASE_HEIGHT = 1.75;

export const PHYSICS = {
  substep: 1 / 240,
  rimRestitution: 0.55,
  rimFriction: 0.88,
  boardRestitution: 0.62,
  boardFriction: 0.9,
  floorRestitution: 0.68,
  floorFriction: 0.86,
  netDrag: 2.6,
  netSpring: 30,
};

// How a swipe turns into a throw. The ideal swipe length is a fraction of the
// viewport height; POWER_SENSITIVITY scales how much a too-long or too-short
// swipe changes the ball speed (1 = direct, lower = more forgiving).
export const SHOT = {
  idealSwipe: 0.32,
  minSwipe: 0.06,
  powerSensitivity: 0.22,
  aimSensitivity: 0.3,
  maxYaw: 0.5,
  entryAngle: 46, // degrees below horizontal the ball drops into the rim at
};

export const GAME = {
  duration: 60,
  fireStreak: 3,
  movingHoopAt: 12,
  fastHoopAt: 18,
};
