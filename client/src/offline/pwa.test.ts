import { reauthUrl, withoutReauth } from './pwa';
it('returns authentication to the original screen with filters preserved', () => {
  for (const path of ['/', '/lesson-plans', '/lesson-notes', '/attendance']) {
    const url = `https://example.test${path}?year=2026#page`;
    expect(reauthUrl(url)).toBe(`${path}?year=2026&reauth=1#page`);
    expect(withoutReauth(`https://example.test${reauthUrl(url)}`)).toBe(`${path}?year=2026#page`);
  }
});
