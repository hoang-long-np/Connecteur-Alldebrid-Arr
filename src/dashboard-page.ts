// Interface web de suivi, servie sur « / ». Page autonome : aucune ressource externe.
// Écrite avec String.raw : ne pas utiliser d'accent grave ni la séquence « $ { » dans le contenu.
export const DASHBOARD_HTML = String.raw`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connecteur AllDebrid</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%232563eb'/%3E%3Cpath d='M16 7v13m-6-6 6 6 6-6M9 25h14' stroke='white' stroke-width='3' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E">
<style>
:root {
  color-scheme: light dark;
  --bg: #f5f6f8; --surface: #ffffff; --surface-2: #eef0f3; --text: #1a1d23; --muted: #667085; --border: #e2e5ea;
  --accent: #2563eb; --accent-soft: #e0eaff; --ok: #15803d; --ok-soft: #dcfce7; --warn: #b45309; --warn-soft: #fef3c7;
  --err: #b91c1c; --err-soft: #fee2e2; --info: #7c3aed; --info-soft: #ede9fe; --track: #e6e9ee;
  --radius: 10px; --shadow: 0 1px 2px rgb(16 24 40 / 6%);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0e1116; --surface: #161a21; --surface-2: #1f242d; --text: #e7e9ee; --muted: #98a2b3; --border: #262c36;
    --accent: #5b8def; --accent-soft: #1c2a47; --ok: #4ade80; --ok-soft: #14301f; --warn: #fbbf24; --warn-soft: #3a2c10;
    --err: #f87171; --err-soft: #3b1717; --info: #a78bfa; --info-soft: #2a2144; --track: #262c36; --shadow: none;
  }
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.wrap { max-width: 1100px; margin: 0 auto; padding: 20px 16px 40px; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.top { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.brand { display: flex; align-items: center; gap: 10px; }
.brand svg { width: 34px; height: 34px; flex: none; }
h1 { font-size: 18px; margin: 0; font-weight: 650; line-height: 1.2; }
.brand small { display: block; color: var(--muted); font-size: 12.5px; }
.status { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-size: 12.5px; font-weight: 550; }
.live::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }

.tone-muted { background: var(--surface-2); color: var(--muted); }
.tone-accent { background: var(--accent-soft); color: var(--accent); }
.tone-info { background: var(--info-soft); color: var(--info); }
.tone-ok { background: var(--ok-soft); color: var(--ok); }
.tone-warn { background: var(--warn-soft); color: var(--warn); }
.tone-err { background: var(--err-soft); color: var(--err); }

.stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 20px; }
.stat { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; box-shadow: var(--shadow); }
.stat .label { display: block; color: var(--muted); font-size: 12.5px; }
.stat .value { display: block; margin-top: 2px; font-size: 24px; font-weight: 650; font-variant-numeric: tabular-nums; }
.stat.alert .value { color: var(--err); }

.panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); margin-bottom: 20px; overflow: hidden; }
.panel-head { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border); }
h2 { font-size: 15px; margin: 0; font-weight: 620; }
.filters { display: flex; flex-wrap: wrap; gap: 3px; padding: 3px; border-radius: 8px; background: var(--surface-2); }
.filters button { border: 0; background: transparent; color: var(--muted); font: inherit; font-size: 13px; padding: 4px 10px; border-radius: 6px; cursor: pointer; }
.filters button[aria-pressed="true"] { background: var(--surface); color: var(--text); box-shadow: 0 1px 2px rgb(0 0 0 / 14%); }
.filters .count { margin-left: 5px; color: var(--muted); font-variant-numeric: tabular-nums; }

.jobs { list-style: none; margin: 0; padding: 0; }
.job { padding: 14px 16px; border-bottom: 1px solid var(--border); }
.job:last-child { border-bottom: 0; }
.job-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.job-name { flex: 1; min-width: 0; font-weight: 560; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge { flex: none; font-size: 11.5px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
.tag { flex: none; font-size: 12px; color: var(--muted); background: var(--surface-2); border-radius: 6px; padding: 1px 7px; }
.bar { height: 6px; margin: 10px 0 8px; border-radius: 999px; background: var(--track); overflow: hidden; }
.fill { height: 100%; border-radius: inherit; background: var(--accent); transition: width .6s ease; }
.stage-completed .fill { background: var(--ok); }
.stage-error .fill { background: var(--err); }
.stage-debrid .fill, .stage-queued .fill { background: var(--info); }
.stage-queued .fill { width: 30% !important; animation: slide 1.4s ease-in-out infinite; }
@keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(340%); } }
.meta { display: flex; flex-wrap: wrap; gap: 2px 16px; color: var(--muted); font-size: 12.5px; font-variant-numeric: tabular-nums; }
.meta .strong { color: var(--text); font-weight: 600; }
.job-error { margin: 8px 0 0; padding: 6px 10px; border-radius: 6px; background: var(--err-soft); color: var(--err); font-size: 13px; overflow-wrap: anywhere; }
.files { margin-top: 8px; font-size: 12.5px; }
.files summary { cursor: pointer; color: var(--muted); width: fit-content; }
.files ul { list-style: none; margin: 6px 0 0; padding: 0; border-left: 2px solid var(--border); }
.files li { display: grid; grid-template-columns: minmax(0, 1fr) auto 3.5em; gap: 12px; padding: 2px 10px; }
.file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-size, .file-progress { color: var(--muted); text-align: right; font-variant-numeric: tabular-nums; }
.empty { margin: 0; padding: 28px 16px; color: var(--muted); text-align: center; }

.check { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 13px; cursor: pointer; }
.logs { max-height: 340px; overflow: auto; padding: 8px 0; font: 12.5px/1.55 ui-monospace, SFMono-Regular, Consolas, monospace; }
.log { display: grid; grid-template-columns: auto 3.6em minmax(0, 1fr); gap: 10px; padding: 1px 16px; }
.log time, .log-level { color: var(--muted); }
.log-level { font-weight: 600; }
.log-msg { overflow-wrap: anywhere; }
.level-warn .log-level, .level-warn .log-msg { color: var(--warn); }
.level-error .log-level, .level-error .log-msg { color: var(--err); }

.foot { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 16px; color: var(--muted); font-size: 12px; }

.login { position: fixed; inset: 0; display: grid; place-items: center; padding: 16px; background: rgb(0 0 0 / 45%); }
.login form { width: 100%; max-width: 340px; display: grid; gap: 12px; padding: 22px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); }
.login p { margin: 0; color: var(--muted); font-size: 13px; }
.field { display: grid; gap: 4px; font-size: 13px; color: var(--muted); }
.field input { font: inherit; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); }
.login .login-error { color: var(--err); }
.primary { font: inherit; font-weight: 600; padding: 9px; border: 0; border-radius: 8px; background: var(--accent); color: #fff; cursor: pointer; }

@media (max-width: 640px) {
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .job-head { flex-wrap: wrap; }
  .job-name { flex-basis: 100%; order: 3; white-space: normal; overflow-wrap: anywhere; }
  .log { grid-template-columns: auto minmax(0, 1fr); }
  .log-level { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .fill { transition: none; }
  .stage-queued .fill { animation: none; }
}
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <div class="brand">
      <svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#2563eb"/><path d="M16 7v13m-6-6 6 6 6-6M9 25h14" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <div><h1>Connecteur AllDebrid</h1><small>Client de téléchargement pour Radarr, Sonarr…</small></div>
    </div>
    <div class="status">
      <span id="account" class="pill tone-muted">AllDebrid…</span>
      <span id="live" class="pill live tone-muted">Connexion…</span>
    </div>
  </header>

  <main>
    <section class="stats" aria-label="Résumé">
      <div class="stat"><span class="label">En cours</span><span id="s-active" class="value">–</span></div>
      <div class="stat"><span class="label">Débit</span><span id="s-speed" class="value">–</span></div>
      <div class="stat"><span class="label">Terminés</span><span id="s-completed" class="value">–</span></div>
      <div class="stat" id="s-error-card"><span class="label">Erreurs</span><span id="s-error" class="value">–</span></div>
    </section>

    <section class="panel" aria-labelledby="jobs-title">
      <div class="panel-head">
        <h2 id="jobs-title">Téléchargements</h2>
        <div class="filters" role="group" aria-label="Filtrer">
          <button type="button" data-filter="all" aria-pressed="true">Tous<span class="count" data-count="all"></span></button>
          <button type="button" data-filter="active" aria-pressed="false">En cours<span class="count" data-count="active"></span></button>
          <button type="button" data-filter="completed" aria-pressed="false">Terminés<span class="count" data-count="completed"></span></button>
          <button type="button" data-filter="error" aria-pressed="false">Erreurs<span class="count" data-count="error"></span></button>
        </div>
      </div>
      <ul id="jobs" class="jobs"></ul>
      <p id="empty" class="empty">Chargement…</p>
    </section>

    <section class="panel" aria-labelledby="logs-title">
      <div class="panel-head">
        <h2 id="logs-title">Journal</h2>
        <label class="check"><input type="checkbox" id="problems-only"> Avertissements et erreurs seulement</label>
      </div>
      <div id="logs" class="logs"></div>
    </section>
  </main>

  <footer id="footer" class="foot"></footer>
</div>

<div id="login" class="login" hidden>
  <form id="login-form">
    <h2>Connexion</h2>
    <p>Mêmes identifiants que ceux saisis dans Radarr/Sonarr.</p>
    <label class="field">Utilisateur<input name="username" autocomplete="username" required></label>
    <label class="field">Mot de passe<input name="password" type="password" autocomplete="current-password" required></label>
    <p id="login-error" class="login-error" hidden>Identifiants incorrects.</p>
    <button type="submit" class="primary">Se connecter</button>
  </form>
</div>

<script>
"use strict";
(function () {
  var REFRESH_MS = 2000;
  var STAGES = {
    queued: { label: "En file AllDebrid", tone: "muted" },
    debrid: { label: "Sur AllDebrid", tone: "info" },
    downloading: { label: "Téléchargement", tone: "accent" },
    completed: { label: "Terminé", tone: "ok" },
    error: { label: "Erreur", tone: "err" }
  };
  var FILTERS = {
    all: function () { return true; },
    active: function (job) { return job.stage === "queued" || job.stage === "debrid" || job.stage === "downloading"; },
    completed: function (job) { return job.stage === "completed"; },
    error: function (job) { return job.stage === "error"; }
  };
  var NBSP = " ";
  var state = { filter: "all", problemsOnly: false, views: {}, logKey: "", timer: 0, data: null };
  var number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

  function $(id) { return document.getElementById(id); }
  function h(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function bytes(value) {
    var units = ["o", "Ko", "Mo", "Go", "To"];
    var unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
    return number.format(unit === 0 ? Math.round(value) : value) + NBSP + units[unit];
  }
  function speed(value) { return value > 0 ? bytes(value) + "/s" : "—"; }
  function percent(value) { return Math.floor(value * 100) + NBSP + "%"; }
  function duration(seconds) {
    if (seconds < 60) return seconds + NBSP + "s";
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + NBSP + "min";
    return Math.floor(minutes / 60) + NBSP + "h" + NBSP + String(minutes % 60).padStart(2, "0");
  }
  function dateTime(ms) {
    return new Date(ms).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function renderAccount(account) {
    var pill = $("account");
    var text = "AllDebrid…";
    var tone = "muted";
    if (account.username) {
      if (!account.isPremium) {
        text = account.username + " · non premium";
        tone = "warn";
      } else {
        text = account.username + " · premium";
        tone = "ok";
        if (account.premiumUntil) {
          text += " jusqu'au " + new Date(account.premiumUntil).toLocaleDateString("fr-FR");
          if (account.premiumUntil - Date.now() < 7 * 86400000) tone = "warn";
        }
      }
      if (account.error) tone = "warn";
    } else if (account.error) {
      text = "AllDebrid injoignable";
      tone = "err";
    }
    pill.textContent = text;
    pill.className = "pill tone-" + tone;
    pill.title = account.error ? "Dernière erreur : " + account.error : "";
  }

  function renderStats(jobs) {
    var rate = jobs.reduce(function (sum, job) { return job.stage === "downloading" ? sum + job.speed : sum; }, 0);
    var errors = jobs.filter(FILTERS.error).length;
    $("s-active").textContent = jobs.filter(FILTERS.active).length;
    $("s-speed").textContent = speed(rate);
    $("s-completed").textContent = jobs.filter(FILTERS.completed).length;
    $("s-error").textContent = errors;
    $("s-error-card").classList.toggle("alert", errors > 0);
    Object.keys(FILTERS).forEach(function (name) {
      document.querySelector('[data-count="' + name + '"]').textContent = jobs.filter(FILTERS[name]).length;
    });
  }

  // Chaque téléchargement garde le même élément d'une actualisation à l'autre :
  // on ne modifie que ce qui change, pour ne perdre ni un clic ni une sélection de texte.
  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function createJobView() {
    var view = {
      item: h("li", "job"),
      badge: h("span", "badge"),
      name: h("span", "job-name"),
      tag: h("span", "tag"),
      bar: h("div", "bar"),
      fill: h("div", "fill"),
      meta: h("div", "meta"),
      metaKey: "",
      error: h("p", "job-error"),
      details: h("details", "files"),
      summary: h("summary"),
      files: h("ul")
    };
    var head = h("div", "job-head");
    head.append(view.badge, view.name, view.tag);
    view.bar.setAttribute("role", "progressbar");
    view.bar.setAttribute("aria-valuemin", "0");
    view.bar.setAttribute("aria-valuemax", "100");
    view.bar.append(view.fill);
    view.details.append(view.summary, view.files);
    view.item.append(head, view.bar, view.meta, view.error, view.details);
    return view;
  }

  // Le premier élément (pourcentage ou « En attente ») est mis en évidence, préfixé par « ! ».
  function metaParts(job) {
    var parts = [];
    if (job.stage === "queued") parts.push("!En attente");
    else if (job.stage !== "error" || job.progress > 0) parts.push("!" + percent(job.progress));
    if (job.size > 0) parts.push(bytes(job.downloaded) + " / " + bytes(job.size));
    if (job.stage === "debrid" || job.stage === "downloading") {
      parts.push((job.stage === "debrid" ? "AllDebrid : " : "") + speed(job.speed));
      if (job.eta != null) parts.push("reste " + duration(job.eta));
    }
    parts.push(job.completedOn ? "terminé le " + dateTime(job.completedOn) : "ajouté le " + dateTime(job.addedOn));
    return parts;
  }

  function updateFiles(list, files) {
    while (list.children.length > files.length) list.lastChild.remove();
    files.forEach(function (file, index) {
      var row = list.children[index];
      if (!row) {
        row = h("li");
        row.append(h("span", "file-name"), h("span", "file-size"), h("span", "file-progress"));
        list.append(row);
      }
      row.title = file.name;
      setText(row.children[0], file.name);
      setText(row.children[1], bytes(file.size));
      setText(row.children[2], percent(file.progress));
    });
  }

  function updateJobView(view, job) {
    var stage = STAGES[job.stage];
    view.item.className = "job stage-" + job.stage;
    view.badge.className = "badge tone-" + stage.tone;
    setText(view.badge, stage.label);
    setText(view.name, job.name);
    view.name.title = job.name;
    view.tag.hidden = !job.category;
    setText(view.tag, job.category);

    view.bar.hidden = job.stage === "error" && job.progress === 0;
    view.fill.style.width = (job.progress * 100).toFixed(1) + "%";
    view.bar.setAttribute("aria-valuenow", String(Math.floor(job.progress * 100)));

    var parts = metaParts(job);
    var metaKey = parts.join("|");
    if (metaKey !== view.metaKey) {
      view.metaKey = metaKey;
      view.meta.replaceChildren.apply(view.meta, parts.map(function (text) {
        return text.charAt(0) === "!" ? h("span", "strong", text.slice(1)) : h("span", null, text);
      }));
    }

    view.error.hidden = !job.error;
    setText(view.error, job.error || "");

    view.details.hidden = job.files.length === 0;
    setText(view.summary, job.files.length + (job.files.length > 1 ? " fichiers" : " fichier"));
    updateFiles(view.files, job.files);
  }

  function renderJobs(jobs) {
    var list = $("jobs");
    var visible = jobs.filter(FILTERS[state.filter]);
    var shown = {};
    var existing = {};
    jobs.forEach(function (job) { existing[job.hash] = true; });

    visible.forEach(function (job, index) {
      var view = state.views[job.hash] || (state.views[job.hash] = createJobView());
      updateJobView(view, job);
      shown[job.hash] = true;
      if (list.children[index] !== view.item) list.insertBefore(view.item, list.children[index] || null);
    });
    Object.keys(state.views).forEach(function (hash) {
      if (shown[hash]) return;
      state.views[hash].item.remove();
      if (!existing[hash]) delete state.views[hash];
    });

    var empty = $("empty");
    empty.hidden = visible.length > 0;
    setText(empty, jobs.length === 0
      ? "Aucun téléchargement pour l'instant. Les torrents envoyés par Radarr, Sonarr… apparaîtront ici."
      : "Aucun téléchargement dans cette catégorie.");
  }

  function renderLogs(logs) {
    var shown = state.problemsOnly ? logs.filter(function (log) { return log.level === "warn" || log.level === "error"; }) : logs;
    var last = shown[shown.length - 1];
    var key = state.problemsOnly + ":" + shown.length + ":" + (last ? last.time + last.message : "");
    if (key === state.logKey) return;
    state.logKey = key;

    var box = $("logs");
    var atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 24;
    box.replaceChildren.apply(box, shown.map(function (log) {
      var row = h("div", "log level-" + log.level);
      var time = h("time", null, new Date(log.time).toLocaleTimeString("fr-FR"));
      time.dateTime = new Date(log.time).toISOString();
      row.append(time, h("span", "log-level", log.level.toUpperCase()), h("span", "log-msg", log.message));
      return row;
    }));
    if (shown.length === 0) box.append(h("p", "empty", "Rien à signaler."));
    if (atBottom) box.scrollTop = box.scrollHeight;
  }

  function renderFooter(data) {
    var footer = $("footer");
    footer.replaceChildren(
      h("span", null, "Dossier : " + data.downloadDir),
      h("span", null, "Démarré le " + dateTime(data.startedAt)),
      h("span", null, "Actualisé à " + new Date(data.now).toLocaleTimeString("fr-FR"))
    );
  }

  function render() {
    var data = state.data;
    if (!data) return;
    renderAccount(data.account);
    renderStats(data.jobs);
    renderJobs(data.jobs);
    renderLogs(data.logs);
    renderFooter(data);
  }

  function setLive(ok) {
    var live = $("live");
    live.textContent = ok ? "En direct" : "Connexion perdue";
    live.className = "pill live tone-" + (ok ? "ok" : "err");
  }

  function schedule(delay) {
    clearTimeout(state.timer);
    if (!document.hidden) state.timer = setTimeout(load, delay);
  }

  function load() {
    clearTimeout(state.timer);
    fetch("ui/status", { cache: "no-store", credentials: "same-origin" })
      .then(function (response) {
        if (response.status === 403) {
          $("login").hidden = false;
          return null;
        }
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        if (!data) return;
        $("login").hidden = true;
        state.data = data;
        render();
        setLive(true);
        schedule(REFRESH_MS);
      })
      .catch(function () {
        setLive(false);
        schedule(REFRESH_MS * 2);
      });
  }

  document.querySelectorAll("[data-filter]").forEach(function (button) {
    button.addEventListener("click", function () {
      state.filter = button.getAttribute("data-filter");
      document.querySelectorAll("[data-filter]").forEach(function (other) {
        other.setAttribute("aria-pressed", String(other === button));
      });
      render();
    });
  });

  $("problems-only").addEventListener("change", function (event) {
    state.problemsOnly = event.target.checked;
    render();
  });

  $("login-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var form = event.target;
    fetch("api/v2/auth/login", { method: "POST", credentials: "same-origin", body: new URLSearchParams(new FormData(form)) })
      .then(function (response) { return response.text(); })
      .then(function (text) {
        var ok = text === "Ok.";
        $("login-error").hidden = ok;
        if (ok) { form.reset(); load(); }
      })
      .catch(function () { $("login-error").hidden = false; });
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) clearTimeout(state.timer);
    else load();
  });

  load();
})();
</script>
</body>
</html>
`;
