(function () {
  "use strict";

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function load(key, fallback) {
    try { var v = localStorage.getItem("nx:" + key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem("nx:" + key, JSON.stringify(value)); } catch (e) {}
  }

  var state = {
    demos: [],
    categories: [],
    catById: {},
    cat: "all",
    q: "",
    view: load("view", "grid") === "list" ? "list" : "grid",
    favs: new Set(load("favs", [])),
    current: null,
  };

  var ICONS = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>',
    starO: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  };

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === "class") node.className = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k]; // only used with the static ICONS above
        else node.setAttribute(k, attrs[k]);
      }
    }
    (children || []).forEach(function (c) { if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return node;
  }

  function hostOf(url) {
    try { return new URL(url).host; } catch (e) { return url; }
  }
  function initials(name) {
    var words = name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
    return ((words[0] || "")[0] + ((words[1] || "")[0] || "")).toUpperCase();
  }
  function normalize(s) { return String(s || "").toLowerCase(); }

  var toastTimer;
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 1800);
  }

  function copy(text) {
    var done = function () { toast("Link copied"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    var ta = el("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    ta.remove();
  }

  // ---------- Data ----------
  function getJSON(url) {
    return fetch(url, { headers: { Accept: "application/json" } }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function init() {
    $("#year").textContent = new Date().getFullYear();
    bindChrome();
    getJSON("/data/demos.json")
      .then(function (data) {
        state.categories = data.categories;
        data.categories.forEach(function (c) { state.catById[c.id] = c; });
        state.demos = data.demos.map(function (d, i) {
          var host = hostOf(d.url);
          return {
            id: host,
            order: i,
            name: d.name,
            url: d.url,
            host: host,
            desc: d.desc || "",
            category: d.category,
            type: d.type || "web",
            search: normalize([d.name, host, d.desc, (state.catById[d.category] || {}).label, d.type].join(" ")),
          };
        });
        readHash();
        renderStats();
        render();
      })
      .catch(function (err) {
        $("#content").replaceChildren(
          el("div", { class: "empty" }, [el("b", { text: "Couldn't load demos" }), "Please refresh the page. (" + err.message + ")"])
        );
      });
  }

  // ---------- Stats / tabs ----------
  function renderStats() {
    var apis = state.demos.filter(function (d) { return d.type === "api"; }).length;
    var stats = [
      [state.demos.length, "Live demos"],
      [state.categories.length, "Categories"],
      [state.demos.length - apis, "Web apps"],
      [apis, "APIs"],
    ];
    $("#stats").replaceChildren.apply(
      $("#stats"),
      stats.map(function (s) { return el("div", { class: "stat" }, [el("b", { text: String(s[0]) }), el("span", { text: s[1] })]); })
    );
  }

  function matches(d) {
    if (!state.q) return true;
    return state.q.split(/\s+/).every(function (term) { return d.search.indexOf(term) !== -1; });
  }

  function renderTabs(filtered) {
    var count = function (pred) { return filtered.filter(pred).length; };
    var tabs = [{ id: "all", label: "All", n: filtered.length }];
    if (state.favs.size) tabs.push({ id: "favs", label: "★ Favorites", n: count(function (d) { return state.favs.has(d.id); }) });
    state.categories.forEach(function (c) {
      tabs.push({ id: c.id, label: c.label, n: count(function (d) { return d.category === c.id; }), hue: c.hue });
    });
    if (!tabs.some(function (t) { return t.id === state.cat; })) state.cat = "all";

    var wrap = $("#tabs");
    wrap.replaceChildren.apply(
      wrap,
      tabs.map(function (t) {
        var b = el("button", { class: "tab", type: "button", role: "tab", "aria-selected": String(t.id === state.cat), "data-cat": t.id });
        if (t.hue !== undefined) {
          var dot = el("span", { class: "dot" });
          dot.style.setProperty("--dot", "hsl(" + t.hue + " 75% 52%)");
          b.appendChild(dot);
        }
        b.appendChild(document.createTextNode(t.label));
        b.appendChild(el("span", { class: "count", text: String(t.n) }));
        return b;
      })
    );
  }

  // ---------- Cards ----------
  function card(d) {
    var cat = state.catById[d.category] || { label: d.category, hue: 220 };
    var fav = state.favs.has(d.id);

    var icon = el("span", { class: "card-icon" });
    var fi = el("img", {
      src: "https://www.google.com/s2/favicons?sz=64&domain=" + encodeURIComponent(d.host),
      alt: "", width: "26", height: "26", loading: "lazy", referrerpolicy: "no-referrer",
    });
    fi.onerror = function () { fi.replaceWith(el("span", { class: "fallback", text: initials(d.name) })); };
    icon.appendChild(fi);

    var art = el("button", { class: "card-art", type: "button", "data-action": "preview", "aria-label": "Preview " + d.name }, [
      el("span", { class: "card-initials", text: initials(d.name), "aria-hidden": "true" }),
      el("span", { class: "play", html: "<span>" + ICONS.play + "Live preview</span>" }),
      icon,
    ]);

    var tags = el("div", { class: "tags" }, [el("span", { class: "tag", text: cat.label })]);
    if (d.type === "api") tags.appendChild(el("span", { class: "tag api", text: "API" }));

    var body = el("div", { class: "card-body" }, [
      el("h3", { class: "card-title", text: d.name }),
      el("div", { class: "card-host", text: d.host, title: d.url }),
      d.desc ? el("p", { class: "card-desc", text: d.desc }) : null,
      tags,
    ]);

    var previewBtn = el("button", { class: "btn btn-primary", type: "button", "data-action": "preview", title: "Preview" });
    previewBtn.innerHTML = ICONS.eye;
    previewBtn.appendChild(el("span", { class: "btn-label", text: "Preview" }));
    var openBtn = el("a", { class: "btn", href: d.url, target: "_blank", rel: "noopener noreferrer", title: "Open in new tab" });
    openBtn.innerHTML = ICONS.ext;
    openBtn.appendChild(el("span", { class: "btn-label", text: "Open" }));

    var favBtn = el("button", {
      class: "fav", type: "button", "data-action": "fav",
      "aria-pressed": String(fav), "aria-label": (fav ? "Remove " : "Add ") + d.name + (fav ? " from" : " to") + " favorites",
      html: fav ? ICONS.star : ICONS.starO,
    });

    var node = el("article", { class: "card", "data-id": d.id }, [art, favBtn, body, el("div", { class: "card-actions" }, [previewBtn, openBtn])]);
    node.style.setProperty("--hue", cat.hue);
    return node;
  }

  function grid(items) {
    return el("div", { class: "grid" + (state.view === "list" ? " list" : "") }, items.map(card));
  }

  function render() {
    var filtered = state.demos.filter(matches);
    renderTabs(filtered);

    $$(".seg [data-view]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.view === state.view)); });

    var content = $("#content");
    var shown;
    if (state.cat === "favs") shown = filtered.filter(function (d) { return state.favs.has(d.id); });
    else if (state.cat !== "all") shown = filtered.filter(function (d) { return d.category === state.cat; });
    else shown = filtered;

    if (!shown.length) {
      var empty = el("div", { class: "empty", html: ICONS.search });
      empty.appendChild(el("b", { text: state.q ? "No demos match “" + state.q + "”" : "Nothing here yet" }));
      empty.appendChild(document.createTextNode(state.q ? "Try a different word, or clear the search." : "Star a demo to add it to your favorites."));
      content.replaceChildren(empty);
      return;
    }

    // "All" without a search groups by category; everything else is a single flat grid.
    if (state.cat === "all" && !state.q) {
      var sections = [];
      state.categories.forEach(function (c) {
        var items = shown.filter(function (d) { return d.category === c.id; });
        if (!items.length) return;
        var dot = el("span", { class: "dot" });
        dot.style.setProperty("--dot", "hsl(" + c.hue + " 75% 52%)");
        sections.push(el("h2", { class: "section-title", id: "cat-" + c.id }, [dot, c.label, el("span", { class: "n", text: String(items.length) })]));
        sections.push(grid(items));
      });
      content.replaceChildren.apply(content, sections);
    } else {
      content.replaceChildren(grid(shown));
    }
  }

  // ---------- Preview ----------
  var hintTimer;
  function openPreview(d, pushHistory) {
    state.current = d;
    $("#pvTitle").textContent = d.name;
    var host = $("#pvHost");
    host.textContent = d.url;
    host.href = d.url;
    $("#pvOpen").href = d.url;
    $("#frameHintLink").href = d.url;
    $("#frameHint").hidden = true;
    $("#frameLoading").hidden = false;
    setDevice(load("device", "desktop"));
    $("#frame").src = d.url;
    $("#preview").hidden = false;
    document.body.style.overflow = "hidden";
    $("#pvClose").focus();
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { $("#frameHint").hidden = false; }, 6000);
    if (pushHistory) history.pushState({ demo: d.id }, "", "#demo=" + encodeURIComponent(d.id));
  }

  function closePreview(fromHistory) {
    if ($("#preview").hidden) return;
    clearTimeout(hintTimer);
    $("#preview").hidden = true;
    $("#frame").src = "about:blank";
    document.body.style.overflow = "";
    var last = state.current;
    state.current = null;
    if (!fromHistory && location.hash.indexOf("#demo=") === 0) history.back();
    if (last) {
      var c = document.querySelector('.card[data-id="' + CSS.escape(last.id) + '"] .btn-primary');
      if (c) c.focus();
    }
  }

  function setDevice(name) {
    if (["desktop", "tablet", "mobile"].indexOf(name) === -1) name = "desktop";
    var wrap = $("#frameWrap");
    wrap.classList.remove("tablet", "mobile");
    if (name !== "desktop") wrap.classList.add(name);
    $$(".preview-devices [data-device]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.device === name)); });
    save("device", name);
  }

  function readHash() {
    var m = location.hash.match(/^#demo=(.+)$/);
    if (m) {
      var id = decodeURIComponent(m[1]);
      var d = state.demos.find(function (x) { return x.id === id; });
      if (d) { openPreview(d, false); return; }
    }
    closePreview(true);
  }

  // ---------- Events ----------
  function bindChrome() {
    var q = $("#q");
    var debounce;
    q.addEventListener("input", function () {
      clearTimeout(debounce);
      debounce = setTimeout(function () { state.q = normalize(q.value.trim()); render(); }, 80);
    });

    $("#tabs").addEventListener("click", function (e) {
      var b = e.target.closest("[data-cat]");
      if (!b) return;
      state.cat = b.dataset.cat;
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    $$(".seg [data-view]").forEach(function (b) {
      b.addEventListener("click", function () { state.view = b.dataset.view; save("view", state.view); render(); });
    });

    $("#content").addEventListener("click", function (e) {
      var actionEl = e.target.closest("[data-action]");
      if (!actionEl) return;
      var cardEl = actionEl.closest(".card");
      var d = state.demos.find(function (x) { return x.id === cardEl.dataset.id; });
      if (!d) return;
      if (actionEl.dataset.action === "preview") openPreview(d, true);
      if (actionEl.dataset.action === "fav") {
        if (state.favs.has(d.id)) { state.favs.delete(d.id); toast("Removed from favorites"); }
        else { state.favs.add(d.id); toast("Added to favorites"); }
        save("favs", Array.from(state.favs));
        render();
      }
    });

    // Preview controls
    $("#pvClose").addEventListener("click", function () { closePreview(false); });
    $("#pvReload").addEventListener("click", function () {
      if (!state.current) return;
      $("#frameLoading").hidden = false;
      $("#frame").src = state.current.url;
    });
    $("#pvCopy").addEventListener("click", function () { if (state.current) copy(state.current.url); });
    $$(".preview-devices [data-device]").forEach(function (b) {
      b.addEventListener("click", function () { setDevice(b.dataset.device); });
    });
    $("#frame").addEventListener("load", function () {
      if ($("#frame").src !== "about:blank") $("#frameLoading").hidden = true;
    });
    window.addEventListener("popstate", readHash);

    // Theme
    $("#theme").addEventListener("click", function () {
      var root = document.documentElement;
      var current = root.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      var next = current === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("nx:theme", next); } catch (e) {}
    });

    // Keyboard
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (!$("#preview").hidden) closePreview(false);
        else if (document.activeElement === q && q.value) { q.value = ""; state.q = ""; render(); }
        return;
      }
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (e.key === "/" && !typing && $("#preview").hidden) { e.preventDefault(); q.focus(); }
    });
  }

  init();
})();
