import type { Outlook } from '../domain/outlook.ts';
import { formatDateShort, formatDuration, formatHours, weekdayShort } from '../domain/format.ts';
import { Card, ProgressBar } from './primitives.tsx';

/**
 * What the engine knows about the coming days: usable training time per day,
 * how much of the week is left, and what the shift plan implies about sleep.
 *
 * `bare` renders without the card frame, for use inside a disclosure.
 */
export function OutlookCard({
  outlook,
  sleepTarget,
  bare,
}: {
  outlook: Outlook;
  sleepTarget: number;
  bare?: boolean;
}) {
  const known = outlook.days.filter((d) => d.known);

  const content = (
    <>
      <div className="grid-3">
        <div className="stat">
          <div className="stat-label">Restwoche</div>
          <div className="stat-value sm t-num">
            {outlook.isLastDayOfWeek || !outlook.restOfWeekComplete
              ? '–'
              : formatDuration(outlook.restOfWeekFreeMinutes)}
          </div>
          <div className="stat-sub">
            {outlook.isLastDayOfWeek
              ? 'Woche endet heute'
              : outlook.restOfWeekComplete
                ? 'freie Zeit'
                : 'Schichten fehlen'}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">7 Tage</div>
          <div className="stat-value sm t-num">
            {known.length > 0 ? formatHours(outlook.totalFreeMinutes / 60) : '–'}
          </div>
          <div className="stat-sub">{outlook.longCapableDays} Tage für lange Einheit</div>
        </div>
        <div className="stat">
          <div className="stat-label">Schlaf</div>
          <div className={`stat-value sm t-num ${outlook.sleepConstrainedAhead ? 'warn' : ''}`}>
            {outlook.expectedSleepAhead != null ? `${outlook.expectedSleepAhead} h` : '–'}
          </div>
          <div className="stat-sub">laut Schichtplan</div>
        </div>
      </div>

      <div className="divider mt-4" />

      <div className="col gap-3">
        {outlook.days.map((day) => (
          <div className="row gap-3" key={day.date}>
            <span className="t-caption muted" style={{ width: 62 }}>
              {weekdayShort(day.date)}, {formatDateShort(day.date)}
            </span>
            <span
              className="shift-tag"
              style={{
                background: day.shift
                  ? `color-mix(in srgb, ${day.shift.color} 22%, transparent)`
                  : 'var(--surface-3)',
                color: day.shift ? 'var(--text)' : 'var(--text-muted)',
              }}
            >
              {day.shift?.short ?? '?'}
            </span>
            <span className="grow">
              <ProgressBar
                value={day.known ? day.freeMinutes : 0}
                max={240}
                thickness="thin"
                color={
                  day.rating === 'green'
                    ? 'var(--good)'
                    : day.rating === 'amber'
                      ? 'var(--warn)'
                      : 'var(--bad)'
                }
              />
            </span>
            <span className="t-caption muted t-num nowrap" style={{ width: 62, textAlign: 'right' }}>
              {day.known ? formatDuration(day.freeMinutes) : 'offen'}
            </span>
          </div>
        ))}
      </div>

      {outlook.unknownDays > 0 && (
        <p className="t-caption muted mt-4">
          {outlook.unknownDays} von {outlook.horizonDays} Tagen haben noch keine Schicht. Solange das
          so ist, zieht die Empfehlung daraus bewusst keine Schlüsse — ein leerer Kalender heißt
          nicht, dass keine guten Tage kommen.
        </p>
      )}

      {outlook.sleepConstrainedAhead && (
        <p className="t-caption warn mt-3">
          Die kommenden Tage lassen im Schnitt nur {outlook.expectedSleepAhead} h Schlaf zu (Ziel{' '}
          {sleepTarget} h). Harte Reize werden deshalb heute niedriger bewertet.
        </p>
      )}
    </>
  );

  return bare ? <>{content}</> : <Card>{content}</Card>;
}
