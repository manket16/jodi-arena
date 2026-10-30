import { html } from 'https://esm.sh/htm@3.1.1/preact/standalone';
import { GiftBox } from './gift.js';

// Top of Home: the surprise gift box. The daily question was removed (still in git history, commit 8d43626).
export function DailyCard(props) {
  return html`<${GiftBox} ...${props} />`;
}
