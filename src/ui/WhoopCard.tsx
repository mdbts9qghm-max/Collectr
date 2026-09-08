import { useEffect, useState } from 'react';
import {
  captureTokensFromUrl,
  clearTokens,
  connectUrl,
  fetchRecent,
  loadTokens,
  saveTokens,
} from '../data/whoopClient.ts';
import type { WhoopTokens } from '../data/whoopClient.ts';
import { useStore } from '../data/store.ts';
import { BASELINE_READY_DAYS } from '../domain/aerobic/whoop.ts';
import { Button, Card, Pill } from './primitives.tsx';

/**
 * The WHOOP connection.
 *
 * Explicit about the split, because it is unusual and worth stating: the client
 * secret sits on the server, the athlete's own tokens sit on their device. There
 * is no account and no database — nothing about them is stored anywhere but
 * their phone.
 */
export function WhoopCard() {
  const [tokens, setTokens] = useState<WhoopTokens | null>(() => loadTokens());
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saveCheckIn = useStore((s) => s.saveCheckIn);
  const checkIns = useStore((s) => s.checkIns);
  const toast = useStore((s) => s.toast);

  // The callback redirects back with the tokens in the fragment.
  useEffect(() => {
    const result = captureTokensFromUrl();
    if (!result) return;
    if (result.error) {
      setStatus(`Verbindung fehlgeschlagen: ${result.error}`);
      return;
    }
    if (result.tokens) {
      saveTokens(result.tokens);
      setTokens(result.tokens);
      setStatus('Verbunden.');
    }
  }, []);

  const importNow = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const data = await fetchRecent();
      if (!data) {
        setStatus('Keine Daten erhalten — vielleicht ist die Verbindung abgelaufen.');
        return;
      }

      /*
       * Imported values are merged into the check-in, never over a value the
       * athlete entered by hand. What they typed is an observation; what the
       * band measured is another one, and the typed one wins on conflict.
       */
      let written = 0;
      for (const [date, metrics] of data.byDate) {
        const existing = checkIns[date];
        const sleep = data.sleepHoursByDate.get(date);
        const next = {
          ...existing,
          date,
          // A day the athlete filled in stays theirs; only an untouched day is
          // attributed to the band.
          source: existing?.source ?? ('whoop' as const),
          updatedAt: new Date().toISOString(),
          whoopRecovery: existing?.whoopRecovery ?? metrics.recoveryPct,
          restingHr: existing?.restingHr ?? metrics.restingHr,
          hrvMs: existing?.hrvMs ?? metrics.hrvMs,
          sleepHours: existing?.sleepHours ?? (sleep ? Math.round((sleep.main + sleep.nap) * 10) / 10 : undefined),
          napTaken: existing?.napTaken ?? (sleep ? sleep.nap > 0 : undefined),
        };
        saveCheckIn(next);
        written += 1;
      }
      setStatus(`${written} Tage übernommen, ${data.sleep.length} Schlafphasen zugeordnet.`);
      toast(`${written} Tage aus WHOOP übernommen`, 'good');
    } catch {
      setStatus('Abruf fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => {
    clearTokens();
    setTokens(null);
    setStatus('Verbindung getrennt. Die bereits übernommenen Werte bleiben.');
  };

  return (
    <Card>
      <div className="row between">
        <span className="row gap-3">
          <span className="icon-badge sm">🔴</span>
          <span className="t-small" style={{ fontWeight: 600 }}>
            WHOOP
          </span>
        </span>
        <Pill tone={tokens ? 'good' : undefined}>{tokens ? 'verbunden' : 'nicht verbunden'}</Pill>
      </div>

      {tokens ? (
        <>
          <div className="row gap-2 mt-4">
            <Button variant="primary" onClick={importNow} disabled={busy}>
              {busy ? 'Hole Daten …' : 'Daten holen'}
            </Button>
            <Button variant="outline" onClick={disconnect}>
              Trennen
            </Button>
          </div>
          <div className="t-caption muted mt-3">
            Recovery wird gegen die Baseline **deines jeweiligen Zyklustags** verrechnet, nicht
            gegen einen absoluten Wert. Bis {BASELINE_READY_DAYS} Tage Historie zusammen sind,
            stuft die App nichts automatisch ab.
          </div>
        </>
      ) : (
        <>
          <p className="t-small secondary mt-3">
            Recovery, HRV, Ruhepuls und Schlafphasen automatisch übernehmen. Ohne WHOOP läuft alles
            weiter über den Check-in — nichts ist davon abhängig.
          </p>
          <a className="btn btn-primary mt-4" href={connectUrl}>
            Mit WHOOP verbinden
          </a>
        </>
      )}

      {status && <div className="t-caption mt-3">{status}</div>}

      <div className="t-caption muted mt-3">
        Dein Zugangstoken liegt auf diesem Gerät, bei deinen übrigen Daten. Auf dem Server liegt nur
        das App-Geheimnis, das nie zu dir übertragen wird. Es gibt kein Konto und keine Datenbank.
      </div>
    </Card>
  );
}
