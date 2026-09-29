import { Vector3 } from 'three';
import { COURT, RELEASE_HEIGHT } from './config.js';
import { pickSpot } from './shot.js';

// One challenge a day, the same for everyone: the date (in UTC) picks the
// twist and seeds the shooting spots, so every player's nth shot is from the
// same place.

const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_DAY = '2026-09-29'; // Daily #1

// Indexed by UTC weekday, Sunday first.
export const TWISTS = [
  { id: 'sudden', name: 'Sudden Death Sunday', short: 'Sudden death', rule: 'Your first miss ends the round.' },
  { id: 'swish', name: 'Swish Monday', short: 'Swish only', rule: 'Only swishes score. Touch the rim or glass and it doesn’t count.' },
  { id: 'glass', name: 'Glass Tuesday', short: 'Glass only', rule: 'Only bank shots score. Use the backboard.' },
  { id: 'downtown', name: 'Downtown Wednesday', short: 'Downtown', rule: 'Every shot is from beyond the arc.' },
  { id: 'blind', name: 'Blind Thursday', short: 'Blind', rule: 'No aim line. Trust the power gauge.' },
  { id: 'freethrow', name: 'Free Throw Friday', short: 'Free throws', rule: 'Every shot is from the free-throw line.' },
  { id: 'moving', name: 'Moving Saturday', short: 'Moving hoop', rule: 'The hoop slides from the very first shot.' },
];

// Every spot beyond the arc; at these distances the corners stay out of bounds.
const DOWNTOWN = { min: 7, max: 7.8, spread: 72 };

export function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function dailyNumber(key) {
  return Math.round((Date.parse(key) - Date.parse(FIRST_DAY)) / DAY_MS) + 1;
}

export function twistFor(key) {
  return TWISTS[new Date(`${key}T00:00:00Z`).getUTCDay()];
}

// Small, fast, seedable generator (mulberry32) keyed by a string hash.
export function seededRandom(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The day's shooting spots in order. Difficulty ramps with the shot number
// rather than with makes, so everyone faces the same sequence.
export function dailySpots(key, twist = twistFor(key), count = 60) {
  const random = seededRandom(`pixel-hoops:${key}`);
  const spots = [];
  let previous = null;
  for (let shot = 0; shot < count; shot++) {
    let spot;
    if (twist.id === 'freethrow') spot = new Vector3(0, RELEASE_HEIGHT, COURT.freeThrow);
    else if (twist.id === 'downtown') spot = pickSpot(0, previous, random, DOWNTOWN);
    else spot = pickSpot(shot < 3 ? 0 : shot < 7 ? 3 : 7, previous, random);
    spots.push(spot);
    previous = spot;
  }
  return spots;
}

// Whether a make scores under the day's rules.
export function makeCounts(twist, { swish, bank }) {
  if (twist?.id === 'swish') return swish;
  if (twist?.id === 'glass') return bank;
  return true;
}

// Share text in the style of Wordle: a heading, the numbers, one square per
// shot, and the link.
export const SQUARES = { swish: '🟨', make: '🟧', void: '⬜', miss: '⬛' };

export function shareText({ title, score, made, attempts, rank, shots, url }) {
  const lines = [title, `${score} pts · ${made}/${attempts} made${rank ? ` · ${rank}` : ''}`];
  for (let i = 0; i < shots.length; i += 10) {
    lines.push(shots.slice(i, i + 10).map((s) => SQUARES[s]).join(''));
  }
  if (url) lines.push(url);
  return lines.join('\n');
}
