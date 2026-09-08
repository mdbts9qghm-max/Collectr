import { useState } from 'react';
import type { Advice, Track } from '../domain/sleep/types.ts';
import { TRACK_META } from '../domain/sleep/types.ts';
import { UNIVERSAL_RULES } from '../domain/sleep/rules.ts';
import { DISCLAIMER, REFERRAL, SUBSTANCES } from '../domain/sleep/substances.ts';
import { CYCLE_DAY_META } from '../domain/aerobic/windows.ts';
import { useSleepView, useToday } from '../app/hooks.ts';
import { useStore } from '../data/store.ts';
import { Card, Disclosure, Pill, SectionTitle, SettingRow, Switch } from '../ui/primitives.tsx';

/**
 * Sleep and recovery coaching.
 *
 * Deliberately free of scores, streaks and badges. Gamifying sleep metrics
 * produces orthosomnia — the measurement of sleep making the sleep worse — which
 * is the one failure mode a module like this can cause all by itself.
 */
export function Sleep() {
  const today = useToday();
  const view = useSleepView(today);
  const { ctx, day, signals, flags } = view;
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const [open, setOpen] = useState<string | null>(null);

  const meta = ctx.cycleDay ? CYCLE_DAY_META[ctx.cycleDay] : null;

  return (
    <>
      {/* Medical flags come first. They are the one thing here that outranks
          any behavioural advice below them. */}
      {flags.map((flag) => (
        <Card key={flag.id} style={{ background: 'var(--bad-soft)', borderColor: 'transparent' }}>
          <div className="row gap-3 row-top">
            <span style={{ fontSize: 17 }}>🩺</span>
            <div className="grow">
              <div className="t-heading">{flag.headline}</div>
              <div className="t-small secondary mt-2">{flag.detail}</div>
            </div>
          </div>
        </Card>
      ))}

      <div className="row between">
        <div>
          <div className="t-label">
            {ctx.isVShift ? 'V-Schicht' : (meta?.label ?? 'Keine Schicht')}
          </div>
          <h1 className="t-title mt-2">Schlaf &amp; Erholung</h1>
        </div>
        {ctx.cycleDay && <Pill>{meta?.short}</Pill>}
      </div>

      <CaffeineCountdown view={view} />

      {/* The two measures with the largest effect, pulled out of the timeline. */}
      {day.highPriority.length > 0 && (
        <Card tight accentEdge>
          <div className="t-label">Die zwei wichtigsten Erinnerungen heute</div>
          {day.highPriority.map((a) => (
            <button
              key={a.id}
              type="button"
              className="advice-row"
              onClick={() => setOpen(open === a.id ? null : a.id)}
              aria-expanded={open === a.id}
            >
              <span className="advice-time t-num">{clock(a.from)}</span>
              <span className="grow left">
                <span className="t-small" style={{ fontWeight: 600, display: 'block' }}>
                  {a.label}
                </span>
                {open === a.id && <span className="t-caption muted mt-1">{a.why}</span>}
              </span>
            </button>
          ))}
        </Card>
      )}

      <Timeline day={day} open={open} onToggle={(id) => setOpen(open === id ? null : id)} />

      {signals.warnings.length > 0 && (
        <Card tight style={{ background: 'var(--warn-soft)', borderColor: 'transparent' }}>
          {signals.warnings.map((w) => (
            <div key={w} className="row gap-3 row-top">
              <span style={{ fontSize: 15 }}>⚠️</span>
              <span className="t-small grow">{w}</span>
            </div>
          ))}
          <div className="t-caption muted mt-2">
            Über die Abstufung entscheidet der Trainingsplaner, nicht dieses Modul. Hier stehen nur
            die Beobachtungen.
          </div>
        </Card>
      )}

      <Card tight>
        <div className="row between">
          <span className="t-label">Schlafschuld im Makrozyklus</span>
          <span className="t-small t-num">{signals.debtHours.toFixed(1)} h</span>
        </div>
        <div className="t-caption muted mt-2">
          Summe dessen, was gegenüber dem Soll des jeweiligen Zyklustags gefehlt hat. Ab 5 h wird
          die nächste harte Einheit abgestuft, ab 8 h kommt ein Deload — beides entscheidet der
          Trainingsplaner.
        </div>
        {signals.contributing.length > 0 && (
          <Disclosure summary={<span className="t-caption muted">Woher sie kommt</span>}>
            <div className="mt-2">
              {signals.contributing.map((c) => (
                <div key={c.date} className="row between t-caption">
                  <span className="muted">{c.date}</span>
                  <span className="t-num bad">−{c.shortfall.toFixed(1)} h</span>
                </div>
              ))}
            </div>
          </Disclosure>
        )}
      </Card>

      <SectionTitle title="Gilt an jedem Tag" />
      <Card flush>
        <div className="list">
          {UNIVERSAL_RULES.map((rule) => (
            <button
              key={rule.label}
              type="button"
              className="advice-row"
              onClick={() => setOpen(open === rule.label ? null : rule.label)}
              aria-expanded={open === rule.label}
            >
              <span className="grow left">
                <span className="t-small" style={{ display: 'block' }}>
                  {rule.label}
                </span>
                {open === rule.label && <span className="t-caption muted mt-1">{rule.why}</span>}
              </span>
            </button>
          ))}
        </div>
      </Card>

      <SectionTitle title="Substanzen" />
      {SUBSTANCES.map((s) => (
        <Card key={s.key} tight>
          <div className="t-label">{s.name}</div>
          <div className="t-small secondary mt-2">{s.mechanism}</div>
          <div className="divider mt-3 mb-3" />
          <div className="t-caption muted">{s.boundary}</div>
          <div className="t-caption mt-2" style={{ fontWeight: 600 }}>
            {REFERRAL}
          </div>
        </Card>
      ))}

      <SectionTitle title="Was die App nicht sehen kann" />
      <Card>
        <SettingRow label="Kaffee-Nap anbieten" hint="Nur sinnvoll, wenn du schnell einschläfst.">
          <Switch
            label="Kaffee-Nap anbieten"
            checked={settings.sleepCoaching.offerCoffeeNap}
            onChange={(v) => updateSettings({ sleepCoaching: { ...settings.sleepCoaching, offerCoffeeNap: v } })}
          />
        </SettingRow>
        <SettingRow
          label="Tagesschläfrigkeit trotz genug Schlaf"
          hint="Führt zu einer Empfehlung, das ärztlich abklären zu lassen."
        >
          <Switch
            label="Tagesschläfrigkeit trotz genug Schlaf"
            checked={settings.sleepCoaching.daytimeSleepiness}
            onChange={(v) => updateSettings({ sleepCoaching: { ...settings.sleepCoaching, daytimeSleepiness: v } })}
          />
        </SettingRow>
        <SettingRow label="Einschlafen gegen den Willen" hint="Etwa am Steuer oder im Dienst.">
          <Switch
            label="Einschlafen gegen den Willen"
            checked={settings.sleepCoaching.involuntarySleepOnset}
            onChange={(v) =>
              updateSettings({ sleepCoaching: { ...settings.sleepCoaching, involuntarySleepOnset: v } })
            }
          />
        </SettingRow>
        <SettingRow label="Beobachtete Atemaussetzer" hint="Von jemandem bemerkt, der dich schlafen sieht.">
          <Switch
            label="Beobachtete Atemaussetzer"
            checked={settings.sleepCoaching.observedApnea}
            onChange={(v) => updateSettings({ sleepCoaching: { ...settings.sleepCoaching, observedApnea: v } })}
          />
        </SettingRow>
      </Card>

      <p className="t-caption muted">{DISCLAIMER}</p>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * The caffeine countdown
 * ------------------------------------------------------------------ */

function CaffeineCountdown({ view }: { view: ReturnType<typeof useSleepView> }) {
  const { countdown } = view.day;
  if (view.ctx.cycleDay == null) return null;

  if (countdown.closed) {
    return (
      <Card tight>
        <div className="row gap-3">
          <span style={{ fontSize: 20 }}>☕</span>
          <span className="grow">
            <span className="t-small" style={{ fontWeight: 600, display: 'block' }}>
              Koffeingrenze für heute vorbei
            </span>
            <span className="t-caption muted">
              Nach 6 h wirkt noch die Hälfte, nach 10 bis 12 h noch ein Viertel.
            </span>
          </span>
        </div>
      </Card>
    );
  }

  if (!countdown.next) return null;
  const hours = Math.floor((countdown.minutesLeft ?? 0) / 60);
  const minutes = (countdown.minutesLeft ?? 0) % 60;

  return (
    <Card tight accentEdge={countdown.remindNow}>
      <div className="row gap-3">
        <span style={{ fontSize: 20 }}>☕</span>
        <span className="grow">
          <span className="t-small" style={{ fontWeight: 600, display: 'block' }}>
            {countdown.next.label}
          </span>
          <span className="t-caption muted">{countdown.next.why}</span>
        </span>
        <span
          className="t-num"
          style={{ fontWeight: 700, color: countdown.remindNow ? 'var(--warn)' : 'var(--text)' }}
        >
          {hours > 0 ? `${hours} h ` : ''}
          {minutes} min
        </span>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * The four-track day timeline
 * ------------------------------------------------------------------ */

const TRACKS: Track[] = ['sleep', 'light', 'caffeine', 'food'];
/** The timeline spans 24 h from the start of the day it belongs to. */
const SPAN = 24 * 60;

function Timeline({
  day,
  open,
  onToggle,
}: {
  day: ReturnType<typeof useSleepView>['day'];
  open: string | null;
  onToggle: (id: string) => void;
}) {
  if (day.advice.length === 0) {
    return (
      <Card tight>
        <div className="t-small secondary">
          Ohne eingetragene Schicht kann die App den Tag nicht einordnen — und rät dann lieber
          nichts, als das Falsche.
        </div>
      </Card>
    );
  }

  return (
    <Card tight>
      <div className="t-label">Tagesleiste</div>

      {/* Hours as a scale above the tracks, so a bar can be read off it. */}
      <div className="tl-hours mt-2">
        {[0, 6, 12, 18, 24].map((hour) => (
          <span key={hour} style={{ left: `${(hour / 24) * 100}%` }}>
            {String(hour % 24).padStart(2, '0')}
          </span>
        ))}
      </div>

      {TRACKS.map((track) => (
        <div key={track} className="tl-track">
          <span className="tl-label" title={TRACK_META[track].label}>
            {TRACK_META[track].icon}
          </span>
          <span className="tl-lane">
            {day.byTrack[track].map((a) => {
              const from = Math.max(0, Math.min(SPAN, a.from));
              const to = Math.max(from + 8, Math.min(SPAN, a.to));
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`tl-bar ${a.avoid ? 'avoid' : ''} ${open === a.id ? 'open' : ''}`}
                  style={{
                    left: `${(from / SPAN) * 100}%`,
                    width: `${((to - from) / SPAN) * 100}%`,
                    background: a.avoid ? 'transparent' : TRACK_META[track].color,
                    borderColor: TRACK_META[track].color,
                  }}
                  onClick={() => onToggle(a.id)}
                  aria-label={`${a.label}, ${clock(a.from)} bis ${clock(a.to)}`}
                  aria-expanded={open === a.id}
                />
              );
            })}
          </span>
        </div>
      ))}

      <div className="divider mt-3" />

      {/* Every recommendation is tappable and shows its reason. No instruction
          without a visible reason. */}
      <div className="list dense" style={{ margin: '0 calc(var(--s3) * -1)' }}>
        {day.advice.map((a) => (
          <button
            key={a.id}
            type="button"
            className="advice-row"
            onClick={() => onToggle(a.id)}
            aria-expanded={open === a.id}
          >
            <span className="advice-time t-num">{clock(a.from)}</span>
            <span className="grow left" style={{ minWidth: 0 }}>
              <span className="row gap-2">
                <span style={{ fontSize: 13 }}>{TRACK_META[a.track].icon}</span>
                <span className={`t-small ${a.avoid ? 'muted' : ''}`} style={{ fontWeight: 560 }}>
                  {a.label}
                </span>
                {a.priority === 'high' && <Pill tone="accent">wichtig</Pill>}
              </span>
              {open === a.id && <span className="t-caption muted mt-2">{a.why}</span>}
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function clock(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

export type { Advice };
