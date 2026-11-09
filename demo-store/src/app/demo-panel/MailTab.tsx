'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { Empty, Panel } from './panel-ui';
import type { PanelData } from './PanelClient';

/**
 * The inbox of the local e-mail provider. A run on this machine sends through a
 * local SMTP catcher (DEMO_MAIL_SINK_URL), so what a scenario sent can be read here
 * instead of in somebody's mailbox.
 */
export function MailTab({ mail }: { mail: NonNullable<PanelData['mail']> }) {
  const router = useRouter();
  // A scenario's message leaves a few seconds after the event: keep looking.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [router]);
  return (
    <Panel
      title="Giden e-postalar"
      hint="Senaryonun gönderdiği e-postalar, yerel SMTP sağlayıcısına (127.0.0.1:1025) düşer. Liste 4 saniyede bir yenilenir."
      action={
        <a href={mail.inboxUrl} target="_blank" rel="noreferrer" className="btn-outline btn-sm">
          Gelen kutusunu aç <ExternalLink size={13} />
        </a>
      }
      id="panel-mail"
    >
      {mail.messages.length === 0 ? (
        <Empty>Henüz e-posta yok. Bir siparişi &ldquo;Teslim edildi&rdquo; yapın; senaryo çalışınca e-posta burada görünür.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {mail.messages.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <div className="min-w-0">
                <a href={`${mail.inboxUrl}/message/${m.id}`} target="_blank" rel="noreferrer" className="link font-medium">
                  {m.subject || '(konu yok)'}
                </a>
                <p className="text-xs text-ink-muted">{m.to}</p>
              </div>
              <span className="text-xs text-ink-muted">{formatDate(m.at, true)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
