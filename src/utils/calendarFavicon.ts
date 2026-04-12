export function initCalendarFavicon(): void {
  const day = new Date().getDate();
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Rounded white background
  ctx.beginPath();
  ctx.roundRect(0, 0, 32, 32, 7);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Red header strip (clipped)
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, 32, 32, 7);
  ctx.clip();
  ctx.fillStyle = '#E24B4A';
  ctx.fillRect(0, 0, 32, 10);
  ctx.restore();

  // Date number
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(day), 16, 22);

  // Inject favicon
  const link =
    (document.querySelector("link[rel~='icon']") as HTMLLinkElement) ||
    document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/png';
  link.href = canvas.toDataURL('image/png');
  document.head.appendChild(link);

  // Schedule refresh at midnight
  const now = new Date();
  const msToMidnight =
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
  setTimeout(initCalendarFavicon, msToMidnight);
}