import Link from 'next/link';
import { Code, DocLink, Field, Panel, SourceLink } from '@/components/developer/DevBits';
import { currentUser, publicUser } from '@/lib/store/auth';

export const metadata = { title: 'İmzalı kimlik' };

const SNIPPET = `// sunucu (lib/selwise/identity.ts)
const userHashTs = Math.floor(Date.now() / 1000);
const userHash = crypto
  .createHmac('sha256', process.env.SELWISE_IDENTITY_SECRET)
  .update(\`\${customerId}:\${userHashTs}\`)
  .digest('hex');

// tarayıcı (lib/selwise/client.ts) — yalnızca imza gelir
window.selwiseLayer.push({
  event: 'user_login',
  user: { id: customerId, loggedIn: true, idHash: userHash, idHashTs: userHashTs },
});
Selwise.identify(customerId, { email, userHash, userHashTs });`;

export default function IdentityPage() {
  const user = publicUser(currentUser());
  const configured = Boolean(process.env.SELWISE_IDENTITY_SECRET);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Bu oturum">
        {!user ? (
          <p>
            Giriş yapılmadı. <Link href="/login?next=/gelistirici/kimlik" className="link">Giriş yapın</Link> ya da{' '}
            <Link href="/register" className="link">üye olun</Link>; sayfa imzayı gösterecek.
          </p>
        ) : (
          <dl>
            <Field label="Müşteri numarası" value={user.selwiseId} />
            <Field label="İmza (userHash)" value={user.selwiseIdHash ?? (configured ? '—' : 'imzasız: SELWISE_IDENTITY_SECRET tanımlı değil')} />
            <Field label="Zaman (userHashTs)" value={user.selwiseIdHashTs ? `${user.selwiseIdHashTs} · ${new Date(user.selwiseIdHashTs * 1000).toISOString()}` : '—'} />
            <Field label="İmzalanan metin" value={user.selwiseIdHashTs ? `${user.selwiseId}:${user.selwiseIdHashTs}` : '—'} />
          </dl>
        )}
        <p>
          Kanal sırrı yalnızca bu mağazanın sunucusundadır. Tarayıcıya giden tek şey yukarıdaki onaltılık özettir; sırrı bilmeyen biri başka bir müşteri
          numarası için geçerli bir imza üretemez.
        </p>
      </Panel>

      <Panel title="Nasıl çalışır">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Panelde kanal → <em>Signed identity</em> → <em>Create secret</em>. Sırrı sunucunun ortam değişkenine koyun.</li>
          <li>Müşteri giriş yapmışken sunucu <code>MUSTERI_NO:ZAMAN</code> metnini HMAC-SHA256 ile imzalar.</li>
          <li>İmza giriş olayının <code>user</code> nesnesine (<code>idHash</code>, <code>idHashTs</code>) ve <code>identify</code> çağrısına eklenir.</li>
          <li>Kanal birkaç gün <em>Report</em> modunda kalır; sayımlarda <em>Signed</em> neredeyse tamamı olunca <em>Enforce</em>’a geçilir.</li>
        </ol>
        <Code>{SNIPPET}</Code>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <SourceLink path="src/lib/selwise/identity.ts" />
          <SourceLink path="src/lib/store/auth.ts" />
          <SourceLink path="src/lib/selwise/client.ts" />
        </div>
        <DocLink path="integration/identity-verification">İmzalı kimlik dokümanı</DocLink>
        <p className="text-xs text-ink-muted">
          Mobil uygulama da aynı imzayı kullanır: uygulama bu mağazanın <code>/api/auth/login</code> ucuna giriş yapar, yanıttaki{' '}
          <code>selwiseIdHash</code>’i <code>selwise.identify(id, traits, {'{ userHash, userHashTs }'})</code> ile verir (examples/expo-app).
        </p>
      </Panel>
    </div>
  );
}
