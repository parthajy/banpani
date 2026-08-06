/* Table-of-contents highlighter for the document pages. Marks the section you're reading. */
(function () {
  var links = Array.prototype.slice.call(document.querySelectorAll('.toc a[href^="#"]'));
  if (!links.length) return;
  var map = {};
  links.forEach(function (a) { var el = document.getElementById(a.getAttribute('href').slice(1)); if (el) map[a.getAttribute('href').slice(1)] = a; });
  var sections = Object.keys(map).map(function (id) { return document.getElementById(id); });
  function onScroll() {
    var top = window.scrollY + 90, current = null;
    for (var i = 0; i < sections.length; i++) { if (sections[i].offsetTop <= top) current = sections[i].id; }
    links.forEach(function (a) { a.classList.remove('active'); });
    if (current && map[current]) map[current].classList.add('active');
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();
})();
