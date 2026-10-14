import { shareText } from './daily.js';

const pageUrl = () => `${location.origin}${location.pathname}`;

// The text for a finished round, daily or classic.
export function resultText({ score, made, attempts, shots, daily, speed }, rank) {
  return shareText({
    title: daily ? `Pixel Hoops Daily #${daily.number} · ${daily.twist.name}` : `Pixel Hoops · ${speed ? 'Speed' : 'Classic'}`,
    score,
    made,
    attempts,
    rank,
    shots,
    url: pageUrl(),
  });
}

// One small square per shot, in the same colours as the shared text. Rows
// of 10, or 20 for the long rounds speed mode makes, so the card stays short.
export function renderGrid(el, shots) {
  const perRow = shots.length > 30 ? 20 : 10;
  el.style.gridTemplateColumns = `repeat(${Math.max(1, Math.min(shots.length, perRow))}, 12px)`;
  el.replaceChildren(
    ...shots.map((kind) => {
      const sq = document.createElement('i');
      sq.className = `sq ${kind}`;
      return sq;
    }),
  );
}

// Share through the phone's share sheet when there is one, otherwise copy to
// the clipboard; failing both, show the text selected for copying by hand.
export async function shareOrCopy(text, status, fallback) {
  status.textContent = '';
  fallback.hidden = true;
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = 'Copied. Paste it anywhere.';
    return;
  } catch {
    // Clipboard access refused; fall through to manual copy.
  }
  fallback.value = text;
  fallback.hidden = false;
  fallback.focus();
  fallback.select();
  status.textContent = 'Copy the text below.';
}
