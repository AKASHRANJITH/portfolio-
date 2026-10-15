// Applies the saved theme before first paint to avoid a flash.
(function () {
  try {
    var t = localStorage.getItem("nx:theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}
})();
