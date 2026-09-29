import { shareText } from './daily.js';

const pageUrl = () => `${location.origin}${location.pathname}`;

// The text for a finished round, daily or classic.
export function resultText({ score, made, attempts, shots, daily }, rank) {
  return shareText({
    title: daily ? `Pixel Hoops Daily #${daily.number} · ${daily.twist.name}` : 'Pixel Hoops · Classic',
    score,
    made,
    attempts,
    rank,
    shots,
    url: pageUrl(),
  });
}

// One small square per shot, in the same colours as the shared text.
export function renderGrid(el, shots) {
  el.style.gridTemplateColumns = `repeat(${Math.max(1, Math.min(shots.length, 10))}, 12px)`;
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
