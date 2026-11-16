'use strict';
// /compute: a chip or a picker applies at once (the form still works without this file, with its Apply button).
(function () {
    var form = document.querySelector('.compute-filters');
    if (!form) return;
    form.classList.add('is-live');
    form.addEventListener('change', function () { if (form.requestSubmit) form.requestSubmit(); else form.submit(); });
})();
