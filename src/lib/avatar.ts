/** Deterministic initials avatar as an inline SVG data URI (no external URLs). */
export function avatarDataUri(name: string): string {
  const initials = (name || "?")
    .trim()
    .split(/\s+/)
    .map(w => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">` +
    `<rect width="80" height="80" fill="hsl(${hue},30%,22%)"/>` +
    `<text x="40" y="52" font-family="sans-serif" font-size="32" font-weight="bold" ` +
    `fill="hsl(${hue},60%,75%)" text-anchor="middle">${initials}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
