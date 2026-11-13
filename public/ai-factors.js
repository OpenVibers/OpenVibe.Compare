/* The agent pair's gap split, drawn with openvibe-shared/ov-metrics.js (OVMetrics.split), never with a chart of
   our own. The page writes the three signed parts; this file hands their sizes to the split bar and keeps the sign
   in the sentence beside it. Without JavaScript the sentence is the whole answer. */
(function (root, factory) {
  const api = factory(typeof document !== 'undefined' ? document : null);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AiFactors = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (doc) {
  'use strict';
  const LABELS = [['model', 'the model'], ['harness', 'the harness'], ['interaction', 'the two together']];
  const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));

  /** [{ key, label, value, signed, tone }] — value is the size the bar draws, signed is the direction. */
  function gapParts(parts = {}) {
    return LABELS.map(([key, label], i) => {
      const signed = num(parts[key]);
      return { key, label, value: signed == null ? null : Math.abs(signed), signed, tone: i + 1 };
    }).filter((p) => p.value != null);
  }

  function draw(d, data, mount) {
    const win = d && d.defaultView;
    const OVMetrics = win && win.OVMetrics;
    if (!OVMetrics || !mount || !data || !data.parts) return null;
    const parts = gapParts(data.parts);
    if (!parts.some((p) => p.value > 0)) return null;
    const split = OVMetrics.split(parts.map((p) => ({ label: p.label, value: p.value, tone: p.tone })), { label: data.label || 'Where the gap comes from' });
    mount.replaceChildren(split);
    return split;
  }

  function mount() {
    const data = doc.getElementById('ai-gap-data');
    const target = doc.getElementById('ai-gap-split');
    if (!data || !target) return;
    try { draw(doc, JSON.parse(data.textContent), target); } catch { /* a page without a gap is fine */ }
  }

  if (doc) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', mount, { once: true });
    else mount();
  }
  return { gapParts, draw };
});
