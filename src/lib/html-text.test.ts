import { describe, expect, it } from 'vitest';
import { decodeEntities } from './html-text';

describe('decodeEntities', () => {
  it('decodes numeric, hex and named entities', () => {
    expect(decodeEntities('The B-52&#39;s - Rock Lobster')).toBe("The B-52's - Rock Lobster");
    expect(decodeEntities('&quot;Hi&quot; &amp; &lt;bye&gt; &#x27;ok&#x27; Beyonc&eacute;')).toBe('"Hi" & <bye> \'ok\' Beyoncé');
  });
  it('leaves plain text and unknown or invalid entities alone', () => {
    expect(decodeEntities('AC/DC & Co')).toBe('AC/DC & Co');
    expect(decodeEntities('&bogus; &#0; &#xD800;')).toBe('&bogus; &#0; &#xD800;');
  });
});
