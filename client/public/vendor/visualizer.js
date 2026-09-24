(function () {
  var root = document.getElementById('root');
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.type !== 'reqspace-visualizer') return;
    if (event.source !== window.parent) return;
    try {
      var template = Handlebars.compile(data.template || '');
      root.innerHTML = template(data.data || {});
    } catch (e) {
      root.textContent = 'Visualizer Error: ' + (e && e.message ? e.message : e);
    }
  });
})();
