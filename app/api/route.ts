import { load } from 'cheerio';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  let isFollowing = false;

  const { searchParams } = new URL(request.url);
  const un = searchParams.get('un')?.toLocaleLowerCase() || '';

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

  return new Response(JSON.stringify({ isFollowing }), {
    headers: { 'content-type': 'application/json' },
  });
}
