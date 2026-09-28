import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const PUBLIC_SCRIPTS = [
  'public/app-core.js',
  'public/app-link-analyzer.js',
  'public/app-order-analyzer.js',
  'public/app-extra.js',
  'public/app-render.js',
  'public/app-forms.js',
  'public/app-item-editor.js'
];

const SHARED_HELPERS = [
  'setButtonBusy',
  'formSnapshot',
  'confirmAction',
  'syncDialogBodyLock',
  'focusDialogInitial',
  'restoreDialogFocus'
];

test('browser shared runtime helpers are defined in app-core', async () => {
  const sources = Object.fromEntries(await Promise.all(
    PUBLIC_SCRIPTS.map(async path => [path, await readFile(path, 'utf8')])
  ));
  const core = sources['public/app-core.js'];

  for (const helper of SHARED_HELPERS) {
    const definition = new RegExp(`function\\s+${helper}\\b`);
    assert.match(core, definition, `${helper} must be defined in public/app-core.js`);

    const consumers = Object.entries(sources)
      .filter(([path]) => path !== 'public/app-core.js')
      .filter(([, source]) => new RegExp(`\\b${helper}\\s*\\(`).test(source))
      .map(([path]) => path);

    if (helper === 'setButtonBusy' || helper === 'confirmAction') {
      assert.ok(consumers.length > 0, `${helper} should have browser consumers`);
    }
  }

  assert.match(core, /function\s+closeSheet\s*\(force\s*=\s*false\)/);
  assert.match(core, /function\s+hasUnsavedChanges\s*\(/);
});
