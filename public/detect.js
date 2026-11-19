// /ai/detect (server/detect.js): a live word count under the box, and the button says it is working while the judges read.
(function () {
    'use strict';
    document.querySelectorAll('[data-dt-form]').forEach(function (form) {
        var box = form.querySelector('textarea');
        var count = form.querySelector('[data-dt-count]');
        var busy = form.querySelector('[data-dt-busy]');
        var button = form.querySelector('button[type="submit"]');
        function paint() {
            if (!box || !count) return;
            var words = (box.value.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
            count.textContent = words ? words + (words === 1 ? ' word' : ' words') + (words < 50 ? ': under 50, no detector can tell' : '') : '';
        }
        if (box) { box.addEventListener('input', paint); paint(); }
        form.addEventListener('submit', function () {
            if (button) { button.disabled = true; }
            if (busy) busy.hidden = false;
        });
    });
})();
