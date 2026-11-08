import assert from 'node:assert/strict';
import test from 'node:test';

import { render as renderComponents, toPlainText as componentsToPlainText } from '@react-email/components';
import { render, toPlainText } from '@react-email/render';
import { createElement } from 'react';

test('direct and component renderers preserve HTML escaping and plain text', async () => {
  const name = '示例用户 <script>alert(1)</script> & test';
  const email = createElement('p', null, name);
  const html = await render(email);

  assert.equal(await renderComponents(email), html);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.equal(toPlainText(html), name);
  assert.equal(componentsToPlainText(html), name);
  assert.equal(await render(email, { plainText: true }), name);
  assert.equal(await renderComponents(email, { plainText: true }), name);
});

test('plain-text conversion keeps default selectors alongside custom selectors', () => {
  const html = '<p>Keep</p><p data-skip-in-text="true">Hidden</p><img src="https://example.com/image.png" alt="Hidden image"><span class="omit">Omit</span>';
  const options = { selectors: [{ selector: '.omit', format: 'skip' }] };

  assert.equal(toPlainText(html, options), 'Keep');
  assert.equal(componentsToPlainText(html, options), 'Keep');
  assert.deepEqual(options, { selectors: [{ selector: '.omit', format: 'skip' }] });
});

test('plain-text links and Unicode remain readable', () => {
  const html = '<p>你好 &amp; welcome</p><p><a href="https://example.com">Visit</a></p><p><a href="https://example.com">https://example.com</a></p>';
  const expected = '你好 & welcome\n\nVisit https://example.com\n\nhttps://example.com';

  assert.equal(toPlainText(html), expected);
  assert.equal(componentsToPlainText(html), expected);
});
