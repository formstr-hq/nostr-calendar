export function initCalendarFavicon(): void {
  const now = new Date();
  const day = now.getDate();
  const month = now.toLocaleString('default', { month: 'short' }).toUpperCase();

  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Black rounded background
  ctx.beginPath();
  ctx.roundRect(0, 0, 32, 32, 7);
  ctx.fillStyle = '#111111';
  ctx.fill();

  // Red header strip (clipped to rounded corners)
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, 32, 32, 7);
  ctx.clip();
  ctx.fillStyle = '#E24B4A';
  ctx.fillRect(0, 0, 32, 10);
  ctx.restore();

  // Month label inside red strip
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 5px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(month, 16, 5);

  // Date number
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(day), 16, 22);

  // Inject favicon
  const link =
    (document.querySelector("link[rel~='icon']") as HTMLLinkElement) ??
    document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/png';
  link.href = canvas.toDataURL('image/png');
  document.head.appendChild(link);

  // Schedule refresh at midnight
  const msToMidnight =
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
  setTimeout(initCalendarFavicon, msToMidnight);
}