import { reauthUrl, withoutReauth } from './pwa';
it('returns authentication to the original screen with filters preserved', () => {
  for (const path of ['/', '/lesson-plans', '/lesson-notes', '/attendance']) {
    const url = `https://example.test${path}?year=2026#page`;
    expect(reauthUrl(url)).toBe(`${path}?year=2026&reauth=1#page`);
    expect(withoutReauth(`https://example.test${reauthUrl(url)}`)).toBe(`${path}?year=2026#page`);
  }
});

it('does not activate reload while a guard blocks the update', async () => {
  const { applyPwaUpdate } = await import('./pwa');
  const guard = jest.fn(() => false);
  expect(await applyPwaUpdate(guard)).toBe(false);
  expect(guard).toHaveBeenCalledTimes(1);
});

it('does not loop reload for an already attempted build', async () => {
  const { reloadForBuild, appBuildId } = await import('./pwa');
  sessionStorage.setItem('nmp.update-attempt', 'already-attempted');
  expect(reloadForBuild('already-attempted')).toBe(false);
  expect(reloadForBuild(appBuildId)).toBe(false);
  sessionStorage.clear();
});
