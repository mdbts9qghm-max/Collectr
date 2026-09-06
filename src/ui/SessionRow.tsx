import type { TrainingSession } from '../domain/types.ts';
import { SPORT_META } from '../domain/format.ts';
import { useStore } from '../data/store.ts';
import { Check, Pill } from './primitives.tsx';
import { sessionSubtitle } from './SessionSheet.tsx';

/**
 * A session in a list.
 *
 * The checkbox completes it in one tap — the evening counterpart to the morning
 * check-in. Tapping the row itself still opens the editor for real durations,
 * distances and RPE, which overwrite the assumed-as-planned values.
 */
export function SessionRow({
  session,
  onOpen,
  showTime,
}: {
  session: TrainingSession;
  onOpen: () => void;
  showTime?: boolean;
}) {
  const toggleSessionDone = useStore((s) => s.toggleSessionDone);
  const toast = useStore((s) => s.toast);

  const complete = () => {
    const wasDone = session.status === 'completed';
    const records = toggleSessionDone(session.id);
    if (wasDone) {
      toast('Wieder als geplant markiert');
      return;
    }
    if (records.length > 0) {
      toast(`Neue Bestleistung: ${records.map((r) => r.label).join(', ')} 🏆`, 'good');
    } else {
      toast('Einheit abgehakt', 'good');
    }
  };

  return (
    <div className={`list-item ${session.status === 'skipped' ? 'done' : ''}`}>
      <Check
        state={session.status === 'completed' ? 'checked' : 'empty'}
        label={`${session.title} abhaken`}
        onClick={complete}
      />
      <button type="button" className="row gap-3 grow left" onClick={onOpen} style={{ minWidth: 0 }}>
        <span
          className="icon-badge sm"
          style={{ background: `color-mix(in srgb, ${SPORT_META[session.sport].color} 18%, transparent)` }}
        >
          {SPORT_META[session.sport].icon}
        </span>
        <span className="grow" style={{ minWidth: 0 }}>
          <span className="t-body truncate" style={{ fontWeight: 570, display: 'block' }}>
            {showTime && session.startTime ? `${session.startTime} · ` : ''}
            {session.title}
          </span>
          <span className="t-caption muted">{sessionSubtitle(session)}</span>
        </span>
      </button>
      {session.status === 'skipped' && <Pill>aus</Pill>}
    </div>
  );
}
