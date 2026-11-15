'use strict';
// The browser check (11-15): Bench's first table column (sticky) painted var(--ov-bg,#fff), a token no theme sets, so
// under a dark site theme on a computer in light mode its light header text sat on white (3.2:1). Every sticky cell
// takes the theme's background first.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'compare.css'), 'utf8');
assert.match(css, /main tr>th:first-child\{position:sticky;left:0;background:var\(--bg-primary,var\(--ov-bg,#fff\)\);z-index:1\}/);
assert.ok(!/background:var\(--ov-bg,#fff\)/.test(css), 'no cell falls back to white before the theme');
console.log('sticky-cells-theme: the sticky cells take the theme background');
