/* Wire a button to expand a Banpani map to full screen for easier panning/zooming.
   Uses the browser Fullscreen API where available (also hides the browser chrome), and falls back to
   a CSS full-viewport mode where it is blocked (e.g. iPhone Safari), so the button always works.
   Call: window.attachFullscreen(buttonEl, targetEl, map)  -- the button must live inside targetEl,
   so it stays visible (and lets you exit) once targetEl is full screen. */
(function () {
  window.attachFullscreen = function (btn, target, map, onToggle) {
    if (!btn) return;
    target = target || document.documentElement;
    var reqFs = target.requestFullscreen || target.webkitRequestFullscreen || target.msRequestFullscreen;
    var exitFs = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;

    function active() {
      var fe = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
      return fe === target || target.classList.contains('fs-expanded');
    }
    function paint() {
      var on = active();
      btn.innerHTML = on ? '✕' : '⛶';
      btn.title = on ? 'Exit full screen' : 'Full screen';
      if (onToggle) try { onToggle(on); } catch (e) {}
      if (map) setTimeout(function () { try { map.invalidateSize(); } catch (e) {} }, 90);
    }
    function pseudo() { target.classList.add('fs-expanded'); document.body.classList.add('fs-lock'); paint(); }
    function enter() {
      if (reqFs) { try { var p = reqFs.call(target); if (p && p.catch) p.catch(pseudo); } catch (e) { pseudo(); } }
      else pseudo();
    }
    function exit() {
      var fe = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
      if (fe && exitFs) { try { exitFs.call(document); } catch (e) {} }
      target.classList.remove('fs-expanded'); document.body.classList.remove('fs-lock'); paint();
    }
    btn.addEventListener('click', function (e) { e.preventDefault(); active() ? exit() : enter(); });
    ['fullscreenchange', 'webkitfullscreenchange', 'msfullscreenchange'].forEach(function (ev) { document.addEventListener(ev, paint); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && target.classList.contains('fs-expanded')) exit(); });
    paint();
  };
})();
