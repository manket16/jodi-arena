import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Story ideas for the 9 stickers in each template. The model picks a different one for each cell.
const THEMES: Record<string, string> = {
  'Funny reactions': 'meme-style funny reactions: eye-roll, facepalm, laughing till crying, "seriously?", shocked, smug, sleepy, hungry, "I told you so". Exaggerated faces and comic energy.',
  'Daily life': 'everyday couple moments in India: sharing chai, texting each other, good morning, good night, eating together, scooter or auto ride, watching a movie on the couch, cooking together, missing each other on a video call.',
  'Bollywood': 'filmy Bollywood moments played by the couple: arms-wide romantic pose, dramatic slow-motion hair flip, singing in the rain, running towards each other, mustard-field dance pose, hero entry swagger, tearful emotional close-up, "mere paas maa hai" style heavy drama (do not copy any real film scene exactly), wedding-song dance.',
  'Cute & romantic': 'sweet romantic moments: hug, forehead kiss, holding hands, heart gesture, blowing a kiss, sharing an umbrella, sleeping on a shoulder, "I love you", "miss you", flower or gift.',
  'Fight & manao': 'the fight and make-up cycle: angry-cute, sulking with back turned, silent treatment, "sorry" with folded hands, offering chocolate, puppy-dog eyes, hug to patch up, "maaf kardo", laughing together again.',
  'Festivals & shaadi': 'Indian celebrations: Diwali diyas and sparklers, Holi colours, Karwa Chauth, Rakhi, Eid or Christmas greeting, wedding dance, sangeet, haldi, varmala, "Happy Anniversary".',
};
const ART: Record<string, string> = {
  'Cartoon': 'bold flat 2D cartoon style with thick clean outlines and bright colours',
  '3D animated': 'cute 3D animated-movie style (soft lighting, big expressive eyes, smooth shapes)',
  'Anime': 'anime and manga style with expressive eyes and clean line art',
  'Comic pop': 'retro comic-book pop-art style with halftone shading and punchy colours',
};
const LANGS: Record<string, string> = {
  'Hinglish': 'Hinglish in Roman script (simple English mixed with Hindi words)',
  'English': 'simple English',
  'Hindi': 'Hindi written in Roman script',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return json({ error: 'Please sign in' }, 401);

  let body: { photos?: string[]; theme?: string; art?: string; lang?: string; extra?: string };
  try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const photos = (Array.isArray(body.photos) ? body.photos : []).filter((p) => typeof p === 'string' && p.length > 100).slice(0, 2);
  if (!photos.length) return json({ error: 'Add at least one photo' }, 400);
  if (photos.some((p) => p.length > 1_500_000)) return json({ error: 'That photo is too large. Try a smaller one.' }, 413);

  const gKey = Deno.env.get('GEMINI_API_KEY');
  if (!gKey) return json({ error: 'Sticker maker is not switched on yet. Add GEMINI_API_KEY in Supabase.' }, 503);

  const { data: q, error: qe } = await sb.rpc('ai_quota_take');
  if (qe) return json({ error: qe.message }, 429);
  const me = String(q.me ?? 'Me'), partner = String(q.partner ?? 'my love');

  const theme = THEMES[body.theme ?? ''] ?? THEMES['Daily life'];
  const art = ART[body.art ?? ''] ?? ART['Cartoon'];
  const lang = LANGS[body.lang ?? ''] ?? LANGS['Hinglish'];
  const extra = String(body.extra ?? '').slice(0, 300);
  const who = photos.length === 2
    ? `The first reference photo is ${me} and the second is ${partner}. Draw both of them as the characters, with faces, hairstyles, skin tone and clothing colours that clearly resemble the photos.`
    : `The reference photo shows ${me}. Draw this person as the main character, resembling the photo (face, hairstyle, skin tone).`;

  const prompt = `Create ONE square image that is a WhatsApp sticker sheet: a 3 by 3 grid containing exactly 9 separate stickers, three per row, evenly spaced, each in its own equal cell.
${who}
Art style: ${art}.
Theme of the sheet: ${theme}
Each of the 9 stickers must show a DIFFERENT pose, expression and situation from the theme, so the sheet feels varied. Keep the characters recognisable and consistent across all 9.
Every sticker is a die-cut sticker: the characters (with a few small props) cut out with a thick white border and a subtle shadow, on a plain solid white background. Nothing may touch or cross the edges between cells.
Add a short caption of 1 to 3 words on each sticker, in bold rounded lettering with a coloured outline, written in ${lang}. Spell every caption correctly and make it easy to read.
${extra ? `Use these details about the couple where they fit: ${extra}.` : ''}
No watermark, no logo, no extra text outside the stickers, no frame around the sheet.`;

  try {
    const model = Deno.env.get('GEMINI_IMAGE_MODEL') ?? 'gemini-2.5-flash-image';
    const parts: unknown[] = [{ text: prompt }];
    for (const p of photos) parts.push({ inlineData: { mimeType: 'image/jpeg', data: p.replace(/^data:[^,]*,/, '') } });
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': gKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } },
      }),
    });
    if (!res.ok) {
      console.error('gemini image', res.status, (await res.text()).slice(0, 400));
      return json({ error: res.status === 429 ? 'The sticker maker is busy. Please try again in a minute.' : 'Could not make the stickers right now. Please try again.' }, 502);
    }
    const out = await res.json();
    const outParts = out?.candidates?.[0]?.content?.parts ?? [];
    const img = outParts.find((p: { inlineData?: { data?: string } }) => p?.inlineData?.data);
    if (!img) {
      console.error('no image', JSON.stringify(out).slice(0, 400));
      return json({ error: 'The stickers did not come out. Please try again, maybe with a clearer photo.' }, 502);
    }
    return json({ ok: true, image: img.inlineData.data, mime: img.inlineData.mimeType ?? 'image/png', left: q.left });
  } catch (e) {
    console.error('sticker failed', e);
    return json({ error: 'Could not make the stickers right now. Please try again.' }, 502);
  }
});
