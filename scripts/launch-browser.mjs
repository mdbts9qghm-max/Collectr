/**
 * Launches Chromium for the verification scripts.
 *
 * Playwright resolves its own browser by default. CHROMIUM_PATH overrides that
 * for environments that ship a browser at a fixed location. Either way the
 * failure message says what to install rather than dumping a stack trace.
 */
export async function launchChromium() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error(
      'Playwright ist nicht installiert.\n' +
        'Installiere es mit:  npm install -D playwright && npx playwright install chromium',
    );
  }

  const executablePath = process.env.CHROMIUM_PATH || undefined;
  try {
    return await chromium.launch(executablePath ? { executablePath } : {});
  } catch (err) {
    throw new Error(
      `Chromium konnte nicht gestartet werden.\n` +
        `Installiere den Browser mit:  npx playwright install chromium\n` +
        `Oder setze CHROMIUM_PATH auf eine vorhandene Chromium-Binary.\n\n` +
        `Ursprünglicher Fehler: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
