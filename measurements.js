(function () {
  "use strict";
  var API = "https://measurements.201-24-48-93.sslip.io";
  var sharedPassword = "";
  var modal, currentController = null, requestVersion = 0, scanObjectUrl = "";

  function makeModal() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "measure-overlay";
    modal.hidden = true;
    modal.innerHTML = '<section class="measure-dialog" role="dialog" aria-modal="true" aria-labelledby="measure-title">' +
      '<button type="button" class="measure-close" aria-label="Закрыть">×</button>' +
      '<h2 id="measure-title">Мерки актёра</h2>' +
      '<div class="measure-identity"><img class="measure-portrait" alt=""><div><strong class="measure-actor"></strong><div class="measure-role"></div></div></div>' +
      '<form class="measure-auth" autocomplete="off"><label for="measure-password">Общий пароль команды</label>' +
      '<div class="measure-auth-row"><input id="measure-password" type="password" required autocomplete="current-password"><button type="submit">Показать</button></div>' +
      '<p class="measure-status" role="status"></p></form>' +
      '<div class="measure-result" hidden></div>' +
      '<button type="button" class="measure-forget">Забыть пароль</button>' +
      '</section>';
    document.body.appendChild(modal);
    modal.querySelector(".measure-close").addEventListener("click", closeModal);
    modal.addEventListener("click", function (event) { if (event.target === modal) closeModal(); });
    modal.querySelector(".measure-forget").addEventListener("click", function () {
      sharedPassword = "";
      requestVersion++;
      if (currentController) currentController.abort();
      currentController = null;
      if (scanObjectUrl) URL.revokeObjectURL(scanObjectUrl);
      scanObjectUrl = "";
      modal.querySelector(".measure-result").replaceChildren();
      modal.querySelector(".measure-result").hidden = true;
      modal.querySelector(".measure-auth").hidden = false;
      modal.querySelector("#measure-password").value = "";
      modal.querySelector(".measure-status").textContent = "Пароль забыли.";
      modal.querySelector("#measure-password").focus();
    });
    modal.querySelector(".measure-auth").addEventListener("submit", function (event) {
      event.preventDefault();
      sharedPassword = modal.querySelector("#measure-password").value;
      loadMeasurements();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && modal && !modal.hidden) closeModal();
    });
    return modal;
  }

  function closeModal() {
    if (!modal) return;
    requestVersion++;
    if (currentController) currentController.abort();
    currentController = null;
    modal.hidden = true;
    if (scanObjectUrl) URL.revokeObjectURL(scanObjectUrl);
    scanObjectUrl = "";
  }

  function openModal(role, actor, thumb) {
    var box = makeModal();
    requestVersion++;
    if (currentController) currentController.abort();
    if (scanObjectUrl) URL.revokeObjectURL(scanObjectUrl);
    scanObjectUrl = "";
    box.hidden = false;
    box.querySelector(".measure-actor").textContent = actor;
    box.querySelector(".measure-role").textContent = role;
    box.querySelector(".measure-portrait").src = "thumbs/" + encodeURIComponent(thumb);
    box.querySelector(".measure-result").replaceChildren();
    box.querySelector(".measure-result").hidden = true;
    var form = box.querySelector(".measure-auth");
    form.hidden = false;
    box.querySelector(".measure-status").textContent = sharedPassword ? "Загружаю мерки…" : "Введите пароль, чтобы посмотреть мерки.";
    box.dataset.role = role;
    box.dataset.actor = actor;
    if (sharedPassword) loadMeasurements();
    else box.querySelector("#measure-password").focus();
  }

  function errorMessage(status, payload) {
    if (status === 401) return "Пароль не подошёл. Введите его ещё раз.";
    if (status === 429) return "Слишком много неверных попыток. Попробуйте через 15 минут.";
    if (status === 403 && payload && payload.error === "actor_not_approved") return "Эта пара «роль — актёр» сейчас не утверждена, данные не выданы.";
    if (status === 404 && payload && payload.error === "measurements_empty") return "Для этой карточки мерки пока не внесены.";
    if (status === 503 && payload && payload.error === "not_configured") return "Защищённый раздел ещё настраивается.";
    if (status === 404) return "Для этой карточки нет отдельного скана мерок.";
    return "Не удалось загрузить мерки. Попробуйте ещё раз.";
  }

  async function loadMeasurements() {
    var box = modal, role = box.dataset.role, actor = box.dataset.actor;
    var form = box.querySelector(".measure-auth"), status = box.querySelector(".measure-status");
    var result = box.querySelector(".measure-result");
    var version = ++requestVersion;
    if (currentController) currentController.abort();
    currentController = new AbortController();
    var signal = currentController.signal;
    form.hidden = true;
    result.hidden = true;
    status.textContent = "Загружаю мерки…";
    var params = new URLSearchParams({ role: role, actor: actor });
    try {
      var response = await fetch(API + "/api/measurements?" + params.toString(), {
        method: "GET", headers: { "Authorization": "Bearer " + sharedPassword },
        credentials: "omit", cache: "no-store", signal: signal
      });
      var payload = await response.json().catch(function () { return {}; });
      if (version !== requestVersion || modal.hidden) return;
      if (!response.ok) {
        if (response.status === 401) sharedPassword = "";
        status.textContent = errorMessage(response.status, payload);
        form.hidden = false;
        box.querySelector("#measure-password").value = "";
        box.querySelector("#measure-password").focus();
        return;
      }

      result.replaceChildren();
      if (payload.fields && payload.fields.length) {
        var heading = document.createElement("h3");
        heading.textContent = "Мерки";
        result.appendChild(heading);
        var list = document.createElement("dl");
        list.className = "measure-fields";
        payload.fields.forEach(function (field) {
          var term = document.createElement("dt"), value = document.createElement("dd");
          term.textContent = field.label;
          value.textContent = field.value;
          list.append(term, value);
        });
        result.appendChild(list);
      }

      if (payload.scan && payload.scanUrl) {
        var scanHeading = document.createElement("h3");
        scanHeading.textContent = "Исходный лист мерок";
        result.appendChild(scanHeading);
        var scan = document.createElement("img");
        scan.className = "measure-scan";
        scan.alt = "Скан листа мерок";
        result.appendChild(scan);
        var scanParams = new URLSearchParams({ role: role, actor: actor });
        var scanResponse = await fetch(API + payload.scanUrl + "?" + scanParams.toString(), {
          method: "GET", headers: { "Authorization": "Bearer " + sharedPassword },
          credentials: "omit", cache: "no-store", signal: signal
        });
        if (version !== requestVersion || modal.hidden) return;
        if (scanResponse.ok) {
          scanObjectUrl = URL.createObjectURL(await scanResponse.blob());
          scan.src = scanObjectUrl;
        } else {
          scan.remove();
          var unavailable = document.createElement("p");
          unavailable.className = "measure-scan-note";
          unavailable.textContent = "Скан листа временно недоступен.";
          result.appendChild(unavailable);
        }
      }
      if (version !== requestVersion || modal.hidden) return;
      result.hidden = false;
      status.textContent = "";
    } catch (error) {
      if (error && error.name === "AbortError") return;
      if (version !== requestVersion || modal.hidden) return;
      status.textContent = "Не получилось связаться с защищённым разделом. Проверьте подключение и попробуйте ещё раз.";
      form.hidden = false;
    }
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest(".measure-button");
    if (!button) return;
    event.preventDefault();
    try {
      openModal(decodeURIComponent(button.dataset.role), decodeURIComponent(button.dataset.actor), button.closest(".card").querySelector(".thumb").getAttribute("src").replace(/^thumbs\//, ""));
    } catch (error) {
      openModal(button.dataset.role, button.dataset.actor, "");
    }
  });
})();
