import React, { useEffect, useState } from 'react';
import { ApiClient, ViewHelpers } from 'adminjs';

// Landing page shown on panel open (see the `dashboard` option in
// adminjs.ts). The handler (dashboard-handler.ts) returns plain counts —
// this component only renders them, it does no querying of its own.

interface DashboardData {
  users: { total: number; newLast7Days: number };
  recipes: { total: number; pendingModeration: number };
  comments: { total: number; pendingModeration: number };
  devices: { total: number };
  imports: {
    active: number;
    last7Days: { done: number; failed: number };
  };
}

const api = new ApiClient();
const h = new ViewHelpers();

function StatCard({
  label,
  value,
  href,
  emphasize,
}: {
  label: string;
  value: string | number;
  href?: string;
  emphasize?: boolean;
}) {
  const content = (
    <div
      style={{
        background: '#16263F',
        border: `1px solid ${emphasize ? '#FDD663' : '#24374F'}`,
        borderRadius: '8px',
        padding: '16px 20px',
        minWidth: '160px',
      }}
    >
      <div style={{ fontSize: '13px', color: '#8CA0BC', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '28px', fontWeight: 600, color: emphasize ? '#FDD663' : '#DDE6F5' }}>{value}</div>
    </div>
  );

  if (!href) return content;
  return (
    <a href={href} style={{ textDecoration: 'none' }}>
      {content}
    </a>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '28px' }}>
      <h3 style={{ margin: '0 0 12px', color: '#DDE6F5', fontSize: '16px' }}>{title}</h3>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getDashboard()
      .then((response) => {
        if (!cancelled) setData(response.data as DashboardData);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return <div style={{ padding: '24px', color: '#F28B82' }}>Failed to load dashboard data.</div>;
  }
  if (!data) {
    return <div style={{ padding: '24px', color: '#8CA0BC' }}>Loading…</div>;
  }

  const moderationQueueTotal = data.recipes.pendingModeration + data.comments.pendingModeration;
  const importsTotal7d = data.imports.last7Days.done + data.imports.last7Days.failed;
  const importSuccessRate =
    importsTotal7d > 0 ? `${Math.round((data.imports.last7Days.done / importsTotal7d) * 100)}%` : '—';

  return (
    <div style={{ padding: '24px' }}>
      <h2 style={{ margin: '0 0 20px', color: '#DDE6F5' }}>Recipely Admin</h2>

      <Section title="Moderation queue">
        <StatCard
          label="Awaiting a decision"
          value={moderationQueueTotal}
          emphasize={moderationQueueTotal > 0}
          href={h.listUrl('Recipe', 'filters.moderationStatus=pending')}
        />
        <StatCard
          label="Pending recipes"
          value={data.recipes.pendingModeration}
          href={h.listUrl('Recipe', 'filters.moderationStatus=pending')}
        />
        <StatCard
          label="Pending comments"
          value={data.comments.pendingModeration}
          href={h.listUrl('Comment', 'filters.moderationStatus=pending')}
        />
      </Section>

      <Section title="Community">
        <StatCard label="Total users" value={data.users.total} href={h.listUrl('User')} />
        <StatCard label="New signups (7d)" value={data.users.newLast7Days} href={h.listUrl('User')} />
        <StatCard label="Total recipes" value={data.recipes.total} href={h.listUrl('Recipe')} />
        <StatCard label="Total comments" value={data.comments.total} href={h.listUrl('Comment')} />
        <StatCard label="Devices" value={data.devices.total} href={h.listUrl('Device')} />
      </Section>

      <Section title="Instagram imports">
        <StatCard label="Active jobs" value={data.imports.active} href={h.listUrl('ImportJob')} />
        <StatCard label="Done (7d)" value={data.imports.last7Days.done} />
        <StatCard label="Failed (7d)" value={data.imports.last7Days.failed} />
        <StatCard label="Success rate (7d)" value={importSuccessRate} />
      </Section>
    </div>
  );
}
