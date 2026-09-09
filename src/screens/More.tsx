import { Link } from 'react-router-dom';
import { NAV_ITEMS } from '../app/nav.tsx';
import { APP_NAME, APP_VERSION } from '../app/version.ts';
import { useData,  } from '../app/hooks.ts';
import { Card, Pill, SectionTitle } from '../ui/primitives.tsx';
import { IconChevronRight } from '../ui/icons.tsx';

export function More() {
  const data = useData();
  const secondary = NAV_ITEMS.filter((i) => !i.primary);

  const completed = data.sessions.filter((s) => s.status === 'completed').length;

  return (
    <>
      <h1 className="t-title">Mehr</h1>

      <Card hero>
        <div className="row between">
          <div>
            <div className="t-label">Erfasst</div>
            <div className="stat-value lg t-num mt-2">{completed}</div>
            <div className="t-caption muted">Einheiten</div>
          </div>
          <div className="right">
            <div className="t-caption muted">{data.records.length} Bestleistungen</div>
          </div>
        </div>
      </Card>

      <Card flush>
        <div className="list">
          {secondary.map((item) => (
            <Link key={item.to} to={item.to} className="list-item clickable">
              <span className="icon-badge sm">{item.icon({ size: 17 })}</span>
              <span className="grow t-body">{item.label}</span>
              <IconChevronRight size={16} />
            </Link>
          ))}
        </div>
      </Card>

      <SectionTitle title="Über die App" />
      <Card>
        <div className="row between">
          <span className="t-small secondary">{APP_NAME}</span>
          <Pill>v{APP_VERSION}</Pill>
        </div>
        <p className="t-caption muted mt-3">
          Läuft vollständig offline auf diesem Gerät. Zum Home-Bildschirm hinzufügen, um sie wie eine
          native App zu nutzen.
        </p>
      </Card>
    </>
  );
}
