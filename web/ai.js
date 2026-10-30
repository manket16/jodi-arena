import { sb } from './lib.js';

const NET = 'Could not reach the server. Check your internet and try again.';
async function call(fn, body) {
  let res;
  try { res = await sb.functions.invoke(fn, { body }); }
  catch (e) { throw new Error(NET); }
  const { data, error } = res;
  if (error) {
    let msg = /fetch|network/i.test(error.message || '') ? NET : (error.message || 'Something went wrong');
    try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (_) { /* keep default */ }
    throw new Error(msg);
  }
  return data;
}

// Text creations (create-ai function). Everything comes from the model, there are no canned templates.
export async function callAI(kind, details = '', names = {}, n = 6) {
  const data = await call('create-ai', { kind, details, n });
  if (!data || !data.data) throw new Error('The reply came back empty. Please try again.');
  return { fallback: false, data: data.data, left: data.left };
}

// Sticker sheet picture (create-sticker function): photos are base64 JPEGs, returns a base64 image.
export async function callSticker(body) {
  const data = await call('create-sticker', body);
  if (!data || !data.image) throw new Error('The stickers did not come out. Please try again.');
  return data;
}
