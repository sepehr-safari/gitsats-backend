import { webln } from '@getalby/sdk';
import NDK, { NDKEvent, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { load } from 'cheerio';
import 'websocket-polyfill';

export const dynamic = 'force-dynamic';

const NDK_PUBLIC_KEY = process.env.NDK_PUBLIC_KEY;
const NDK_PRIVATE_KEY = process.env.NDK_PRIVATE_KEY;
const NWC_URL = process.env.NWC_URL;
const ZAP_AMOUNT = 1000 * 1000; // 1000 sats
const HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-cache',
  'Access-Control-Allow-Origin': '*',
};

export async function GET(request: Request) {
  // check environment variables
  if (!NDK_PUBLIC_KEY || !NDK_PRIVATE_KEY || !NWC_URL) {
    return new Response(
      JSON.stringify({ success: false, error: 'Missing environment variables' }),
      {
        status: 500,
        headers: HEADERS,
      }
    );
  }

  // app state
  let paidUsers: string[] = [];
  let isFollowing = false;
  let isPaid = false;

  // get query params
  const { searchParams } = new URL(request.url);
  const un = searchParams.get('un')?.toLocaleLowerCase() || '';
  const pk = searchParams.get('pk') || '';
  if (!un || !pk) {
    return new Response(JSON.stringify({ success: false, error: 'Missing parameters' }), {
      status: 400,
      headers: HEADERS,
    });
  }

  // check if user is following
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
    return new Response(JSON.stringify({ success: false, error: 'Not following' }), {
      status: 400,
      headers: HEADERS,
    });
  }

  // initiate NDK to interact with Nostr
  const ndk = new NDK({
    signer: new NDKPrivateKeySigner(NDK_PRIVATE_KEY),
    autoConnectUserRelays: false,
    autoFetchUserMutelist: false,
    explicitRelayUrls: [
      'wss://relay.getalby.com',
      'wss://nos.lol',
      'wss://relay.nostr.band',
      'wss://relay.damus.io',
    ],
  });
  await ndk.connect();

  // check if user has already been paid
  const paidUsersEvent = await ndk.fetchEvent({
    limit: 1,
    kinds: [30078],
    authors: [NDK_PUBLIC_KEY],
    '#d': ['gitsats-paid-follow'],
  });
  if (!paidUsersEvent) {
    return new Response(
      JSON.stringify({ success: false, error: 'Error fetching paid users event' }),
      {
        status: 500,
        headers: HEADERS,
      }
    );
  }
  try {
    await paidUsersEvent.decrypt(ndk.getUser({ pubkey: NDK_PUBLIC_KEY }));
    paidUsers = JSON.parse(paidUsersEvent.content);
  } catch (_) {
    return new Response(JSON.stringify({ success: false, error: 'Error parsing paid users' }), {
      status: 500,
      headers: HEADERS,
    });
  }
  if (paidUsers.includes(un)) {
    return new Response(JSON.stringify({ success: false, error: 'Already paid' }), {
      status: 400,
      headers: HEADERS,
    });
  }

  // create invoice
  const user = ndk.getUser({ pubkey: pk });
  const invoice = await user.zap(ZAP_AMOUNT);
  if (!invoice) {
    return new Response(JSON.stringify({ success: false, error: 'Error creating invoice' }), {
      status: 500,
      headers: HEADERS,
    });
  }

  // initiate WebLN to pay the invoice
  const nwc = new webln.NWC({ nostrWalletConnectUrl: NWC_URL });
  await nwc.enable();

  // pay the invoice
  const payRes = await nwc.sendPayment(invoice);
  if (payRes) {
    isPaid = true;
  }

  // add user to paid list
  paidUsers.push(un);

  // publish new paid users event
  const newPaidUsersEvent = new NDKEvent(ndk);
  newPaidUsersEvent.kind = 30078;
  newPaidUsersEvent.content = JSON.stringify(paidUsers);
  newPaidUsersEvent.tags = [['d', 'gitsats-paid-follow']];
  try {
    await newPaidUsersEvent.encrypt(ndk.getUser({ pubkey: NDK_PUBLIC_KEY }));
    await newPaidUsersEvent.publish();
  } catch (_) {
    return new Response(JSON.stringify({ success: false, error: 'Error publishing paid list' }), {
      status: 500,
      headers: HEADERS,
    });
  }

  // return response
  return new Response(JSON.stringify({ success: true, isFollowing, isPaid }), {
    status: 200,
    headers: HEADERS,
  });
}
