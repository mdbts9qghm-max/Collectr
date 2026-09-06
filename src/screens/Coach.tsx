import { useRef, useState } from 'react';
import { COACH_SUGGESTIONS, askCoach } from '../domain/coach.ts';
import type { CoachAnswer } from '../domain/coach.ts';
import { useData, useIndexes, useToday } from '../app/hooks.ts';
import { Button, Card, Pill, TextInput } from '../ui/primitives.tsx';
import { IconChevronRight } from '../ui/icons.tsx';

interface Turn {
  id: number;
  question: string;
  answer: CoachAnswer;
}

export function Coach() {
  const today = useToday();
  const data = useData();
  const idx = useIndexes();
  const [input, setInput] = useState('');
  const [log, setLog] = useState<Turn[]>([]);
  const nextId = useRef(1);
  const bottomRef = useRef<HTMLDivElement>(null);

  const ask = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed) return;
    const answer = askCoach(trimmed, data, idx, today);
    setLog((l) => [...l, { id: nextId.current++, question: trimmed, answer }]);
    setInput('');
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
  };

  return (
    <>
      <div>
        <h1 className="t-title">Coach</h1>
        <p className="t-small muted mt-2">
          Antwortet ausschließlich aus deinen gespeicherten Daten — regelbasiert, offline, ohne
          externe Dienste. Wenn Daten fehlen, sagt er das, statt zu raten.
        </p>
      </div>

      {log.length === 0 && (
        <Card>
          <div className="t-label mb-3">Frag mich zum Beispiel</div>
          <div className="col gap-2">
            {COACH_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className="row between gap-3"
                style={{ padding: '9px 0', textAlign: 'left', width: '100%' }}
                onClick={() => ask(s)}
              >
                <span className="t-small grow">{s}</span>
                <IconChevronRight size={15} />
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="coach-log">
        {log.map((turn) => (
          <div key={turn.id} className="col gap-3">
            <div className="bubble user">{turn.question}</div>
            <div className="bubble coach">{turn.answer.text}</div>
            {turn.answer.facts && turn.answer.facts.length > 0 && (
              <div className="row gap-2 wrap">
                {turn.answer.facts.map((f) => (
                  <Pill key={f.label} tone={turn.answer.noData ? 'default' : 'accent'}>
                    {f.label}: {f.value}
                  </Pill>
                ))}
              </div>
            )}
            {turn.answer.followUps && turn.answer.followUps.length > 0 && (
              <div className="chip-row">
                {turn.answer.followUps.map((f) => (
                  <button key={f} type="button" className="chip" onClick={() => ask(f)}>
                    {f}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        className="row gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <div className="grow">
          <TextInput
            value={input}
            placeholder="Deine Frage…"
            onChange={(e) => setInput(e.target.value)}
            aria-label="Frage an den Coach"
          />
        </div>
        <Button variant="primary" type="submit" disabled={!input.trim()}>
          Fragen
        </Button>
      </form>

      {log.length > 0 && (
        <Button variant="ghost" block onClick={() => setLog([])}>
          Verlauf leeren
        </Button>
      )}
    </>
  );
}
