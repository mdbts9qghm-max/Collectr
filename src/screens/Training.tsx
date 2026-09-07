import { Card, SectionTitle } from '../ui/primitives.tsx';

/**
 * The training tab — cleared out, ready to be rebuilt.
 *
 * The screen is gone; nothing below it is. The cycle planner in
 * `src/domain/cycle/` still computes the whole plan, `useCyclePlan` still hands
 * it to any screen that asks, and the Today screen and the morning check-in
 * still read it. Only the presentation was thrown away.
 */
export function Training() {
  return (
    <>
      <SectionTitle title="Training" subtitle="Dieser Tab wird gerade neu gebaut." />
      <Card>
        <div className="t-small secondary">
          Die Planungslogik läuft weiter: Zyklusvorlage, Erholungsfilter, harte Regeln und das
          Belastungsverhältnis sind unverändert. Was hier fehlt, ist nur die Darstellung.
        </div>
        <div className="t-caption muted mt-3">
          Der Tagesbildschirm und der Morgen-Check-in zeigen weiterhin die Einheit des Tages.
        </div>
      </Card>
    </>
  );
}
