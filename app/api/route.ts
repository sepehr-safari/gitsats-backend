import { webln } from '@getalby/sdk';
import NDK, { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { load } from 'cheerio';
import 'websocket-polyfill';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  let isFollowing = false;
  let isPaid = false;

  const { searchParams } = new URL(request.url);
  const un = searchParams.get('un')?.toLocaleLowerCase() || '';
  const pk = searchParams.get('pk') || '';

  if (!un || !pk) {
    return new Response('Missing parameters', { status: 400 });
  }

  const res = await fetch(`https://github.com/sepehr-safari?tab=followers`);
  const html = await res.text();

  const $ = load(html);
  $('img.avatar.avatar-user').each((_, el) => {
    const img = $(el);
    const username = img.attr('alt')?.replace('@', '').toLocaleLowerCase();
    if (username === un) {
      isFollowing = true;
    }
  });

  if (!isFollowing) {
    return new Response(JSON.stringify({ isFollowing, isPaid }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  const nwc = new webln.NWC({ nostrWalletConnectUrl: process.env.NWC_URL });
  await nwc.enable();

  const ndk = new NDK({
    signer: new NDKPrivateKeySigner(process.env.NDK_PRIVATE_KEY),
    autoConnectUserRelays: false,
    autoFetchUserMutelist: false,
    explicitRelayUrls: ['wss://relay.getalby.com', 'wss://nos.lol', 'wss://relay.nostr.band'],
  });
  await ndk.connect();
  const user = ndk.getUser({ pubkey: pk });
  const invoice = await user.zap(1000);
  if (!invoice) {
    return new Response('Error creating invoice', { status: 500 });
  }

  const payRes = await nwc.sendPayment(invoice);
  if (payRes) {
    isPaid = true;
  }

  return new Response(JSON.stringify({ isFollowing, isPaid }), {
    headers: { 'content-type': 'application/json' },
  });
}
