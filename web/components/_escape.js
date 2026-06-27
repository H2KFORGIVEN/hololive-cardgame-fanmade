// Shared HTML-escape helper for all view components. Use whenever
// interpolating user/scraped content into an `innerHTML` template literal.
// Prevents XSS from poisoned upstream data (tweet text, deck titles,
// scraped player names, admin-entered fields, etc.).
export function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}
