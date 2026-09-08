import { Card, SectionTitle } from '../ui/primitives.tsx';

/**
 * The training tab — cleared out, ready to be rebuilt.
 *
 * The screen is gone; nothing below it is. `src/domain/aerobic/` still computes
 * the whole plan — phases, interval stages, volume distribution, the recovery
 * filter, the hard rules — and `useAerobicPlan` still hands it to any screen
 * that asks. Only the presentation was thrown away.
 */
export function Training() {
  return (
    <>
      <SectionTitle title="Training" subtitle="Dieser Tab wird gerade neu gebaut." />
      <Card>
        <div className="t-small secondary">
          Die Planungslogik läuft weiter: Phasenmodell, Bahnstufen, Volumenverteilung,
          Erholungsfilter und die harten Regeln sind unverändert. Was hier fehlt, ist nur die
          Darstellung.
        </div>
        <div className="t-caption muted mt-3">
          Das Schlafmodul und der Morgen-Check-in sind davon nicht betroffen.
        </div>
      </Card>
    </>
  );
}
