"use strict";

(() => {
  const storageKey = "literature.org.readerSettings";
  const lastLocationKey = "literature.org.lastReadingLocation";
  const defaults = {
    width: "normal",
    font: "open-sans",
    size: 16,
    theme: "system",
    resumeLastLocation: true
  };
  const legacySizes = { small: 14, medium: 16, large: 20 };
  const allowed = {
    width: ["narrow", "normal", "wide"],
    font: ["open-sans", "karla", "georgia", "times", "arial", "verdana", "opendyslexic"],
    theme: ["light", "dark", "system"]
  };
  let settings = { ...defaults };
  let dialog;
  let status;

  function isAllowed(key, value) {
    if (key === "size") return Number.isInteger(value) && value >= 6 && value <= 32;
    if (key === "resumeLastLocation") return typeof value === "boolean";
    return allowed[key].includes(value);
  }

  function applySettings() {
    const root = document.documentElement;
    root.dataset.readerWidth = settings.width;
    root.dataset.readerFont = settings.font;
    root.dataset.readerSize = settings.size;
    root.dataset.readerTheme = settings.theme;
    root.style.setProperty("--reader-font-size", `${settings.size}pt`);
  }

  function loadSettings() {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === null) return;

      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Saved reader settings are not an object.");
      }

      for (const key of Object.keys(defaults)) {
        const value = key === "size" && typeof parsed.size === "string" &&
          Object.prototype.hasOwnProperty.call(legacySizes, parsed.size)
          ? legacySizes[parsed.size]
          : parsed[key];
        if (isAllowed(key, value)) settings[key] = value;
      }
    } catch (error) {
      console.error("Could not read saved reader settings.", error);
      if (status) status.textContent = "Saved settings could not be read. Defaults are being used.";
    }
  }

  function saveSettings(successMessage = "Settings saved in this browser.") {
    try {
      localStorage.setItem(storageKey, JSON.stringify(settings));
      status.textContent = successMessage;
    } catch (error) {
      console.error("Could not save reader settings in this browser.", error);
      status.textContent = "Settings apply for this visit, but could not be saved in this browser.";
    }
  }

  function paragraphsIn(article) {
    const paragraphs = [...article.querySelectorAll("p")];
    paragraphs.forEach((paragraph, index) => {
      if (!paragraph.id) paragraph.id = `reader-paragraph-${index + 1}`;
    });
    return paragraphs;
  }

  function visibleParagraph(paragraphs) {
    const toolbarBottom = document.querySelector(".reader-toolbar")?.getBoundingClientRect().bottom ?? 0;
    return paragraphs.find((paragraph) => {
      const bounds = paragraph.getBoundingClientRect();
      return bounds.bottom > toolbarBottom && bounds.top < window.innerHeight;
    });
  }

  function syncControls() {
    dialog.querySelectorAll("[name]").forEach((control) => {
      if (control.type === "checkbox") {
        control.checked = settings[control.name];
      } else if (control.type === "radio") {
        control.checked = control.value === settings[control.name];
      } else {
        control.value = settings[control.name];
      }
    });
    dialog.querySelector("#reader-settings-size-value").value = `${settings.size} pt`;
    dialog.querySelector("#reader-settings-size").setAttribute("aria-valuetext", `${settings.size} points`);
  }

  function createDialog() {
    dialog = document.createElement("dialog");
    dialog.className = "reader-settings-dialog";
    dialog.setAttribute("aria-labelledby", "reader-settings-title");
    dialog.innerHTML = `
      <div class="reader-settings-heading">
        <h2 id="reader-settings-title">Reading settings</h2>
        <button class="w3-button" type="button" aria-label="Close reading settings">
          <i class="material-icons md-lit" aria-hidden="true">close</i>
        </button>
      </div>
      <fieldset>
        <legend>Reading width</legend>
        <div class="reader-width-options">
          <label><input type="radio" name="width" value="narrow">
            <i class="material-icons" aria-hidden="true">format_indent_decrease</i> Narrow</label>
          <label><input type="radio" name="width" value="normal">
            <i class="material-icons" aria-hidden="true">format_align_justify</i> Normal</label>
          <label><input type="radio" name="width" value="wide">
            <i class="material-icons" aria-hidden="true">format_indent_increase</i> Wide</label>
        </div>
      </fieldset>
      <label class="reader-settings-field" for="reader-settings-font">Font</label>
      <select id="reader-settings-font" name="font">
        <option value="arial">Arial (sans-serif)</option>
        <option value="georgia">Georgia (serif)</option>
        <option value="karla">Karla</option>
        <option value="opendyslexic">Open Dyslexic (dyslexia-friendly)</option>
        <option value="open-sans">Open Sans (default)</option>
        <option value="times">Times New Roman (serif)</option>
        <option value="verdana">Verdana (sans-serif)</option>
      </select>
      <label class="reader-settings-field" for="reader-settings-size">Font size
        <output id="reader-settings-size-value" for="reader-settings-size">16 pt</output>
      </label>
      <input id="reader-settings-size" name="size" type="range" min="6" max="32" step="1" value="16"
        list="reader-settings-size-ticks" aria-describedby="reader-settings-size-value reader-settings-size-limits">
      <datalist id="reader-settings-size-ticks">
        <option value="6"></option><option value="8"></option><option value="10"></option>
        <option value="12"></option><option value="14"></option><option value="16"></option>
        <option value="18"></option><option value="20"></option><option value="22"></option>
        <option value="24"></option><option value="26"></option><option value="28"></option>
        <option value="30"></option><option value="32"></option>
      </datalist>
      <div id="reader-settings-size-limits" class="reader-settings-size-limits" aria-hidden="true">
        <span>6 pt</span><span>32 pt</span>
      </div>
      <label class="reader-settings-field" for="reader-settings-theme">Theme</label>
      <select id="reader-settings-theme" name="theme">
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">Follow browser / system</option>
      </select>
      <label class="reader-settings-resume">
        <input type="checkbox" name="resumeLastLocation">
        Return to your last reading location when opening the home page
      </label>
      <p class="reader-settings-privacy">Your reading settings and last reading location are stored only in this browser and are never sent to literature.org. <a href="#" class="reader-settings-reset-link">Reset to defaults</a>.</p>
      <p class="reader-settings-status" role="status" aria-live="polite"></p>
    `;
    document.body.appendChild(dialog);
    status = dialog.querySelector(".reader-settings-status");
    dialog.querySelector(".reader-settings-heading button").addEventListener("click", () => dialog.close());
    dialog.querySelector(".reader-settings-reset-link").addEventListener("click", (event) => {
      event.preventDefault();
      settings = { ...defaults };
      applySettings();
      syncControls();
      saveSettings("Reading settings reset to defaults.");
      initializeLastLocation();
    });
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) {
        dialog.close();
      }
    });
    dialog.addEventListener("change", (event) => {
      const control = event.target;
      if (!control.name) return;
      const value = control.type === "checkbox"
        ? control.checked
        : control.name === "size" ? Number(control.value) : control.value;
      if (!isAllowed(control.name, value)) return;
      settings[control.name] = value;
      applySettings();
      saveSettings();
      if (control.name === "resumeLastLocation") initializeLastLocation();
    });
    dialog.addEventListener("input", (event) => {
      const control = event.target;
      if (control.name !== "size") return;
      const value = Number(control.value);
      if (!isAllowed("size", value)) return;
      settings.size = value;
      applySettings();
      dialog.querySelector("#reader-settings-size-value").value = `${value} pt`;
      control.setAttribute("aria-valuetext", `${value} points`);
    });
  }

  function initializeFontSizePinch() {
    const article = document.querySelector("article.reader-content");
    if (!article || article.dataset.fontSizePinchInitialized) return;
    article.dataset.fontSizePinchInitialized = "true";

    let pinch;
    const distanceBetweenTouches = (touches) => {
      const deltaX = touches[0].pageX - touches[1].pageX;
      const deltaY = touches[0].pageY - touches[1].pageY;
      return Math.hypot(deltaX, deltaY);
    };
    const finishPinch = () => {
      if (pinch?.changed) saveSettings();
      pinch = undefined;
    };

    article.addEventListener("touchstart", (event) => {
      if (event.touches.length !== 2) {
        if (event.touches.length > 2) finishPinch();
        return;
      }
      if (event.target instanceof Element && event.target.closest("a, button, input, select, textarea")) return;
      const distance = distanceBetweenTouches(event.touches);
      if (distance === 0) return;
      pinch = { distance, size: settings.size, changed: false };
    }, { passive: true });

    article.addEventListener("touchmove", (event) => {
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();
      const size = Math.min(32, Math.max(6, Math.round(
        pinch.size * distanceBetweenTouches(event.touches) / pinch.distance
      )));
      if (size === settings.size) return;
      settings.size = size;
      pinch.changed = true;
      applySettings();
      syncControls();
    }, { passive: false });

    article.addEventListener("touchend", (event) => {
      if (event.touches.length < 2) finishPinch();
    }, { passive: true });
    article.addEventListener("touchcancel", finishPinch, { passive: true });
  }

  function addSettingsButton(drawer) {
    if (drawer.querySelector(".reader-settings-button")) return;
    const menu = drawer.querySelector("#sidebar-links") || drawer;
    const button = document.createElement("button");
    button.className = "w3-bar-item w3-button reader-settings-button";
    button.type = "button";
    button.title = "Reading settings";
    button.setAttribute("aria-label", "Reading settings");
    button.innerHTML = '<i class="material-icons md-lit" aria-hidden="true">settings</i><span class="reader-drawer-label">Reading settings</span>';
    button.addEventListener("click", () => {
      syncControls();
      dialog.showModal();
    });
    menu.appendChild(button);
  }

  function initializeLastLocation() {
    if (!settings.resumeLastLocation) return;

    if ((window.location.pathname === "/" || window.location.pathname === "/index.html") &&
        !window.location.search && !window.location.hash) {
      try {
        if (document.referrer && new URL(document.referrer).origin === window.location.origin) return;
        const savedLocation = localStorage.getItem(lastLocationKey);
        if (!savedLocation) return;
        const destination = new URL(savedLocation, window.location.origin);
        if (destination.origin !== window.location.origin || destination.pathname === "/") return;
        window.location.replace(destination.href);
      } catch (error) {
        console.error("Could not restore the last reading location.", error);
      }
      return;
    }

    const article = document.querySelector("article.reader-content");
    if (!article) return;
    if (article.dataset.lastLocationInitialized) return;
    article.dataset.lastLocationInitialized = "true";
    const paragraphs = paragraphsIn(article);

    if (window.location.hash) {
      let fragment;
      try {
        fragment = decodeURIComponent(window.location.hash.slice(1));
      } catch (error) {
        fragment = window.location.hash.slice(1);
      }
      document.getElementById(fragment)?.scrollIntoView({ block: "start" });
    }

    let savePending = false;
    const saveVisibleParagraph = () => {
      savePending = false;
      if (!settings.resumeLastLocation) return;
      const paragraph = visibleParagraph(paragraphs);
      if (!paragraph) return;
      try {
        const destination = new URL(window.location.href);
        destination.hash = paragraph.id;
        localStorage.setItem(lastLocationKey, `${destination.pathname}${destination.search}${destination.hash}`);
      } catch (error) {
        console.error("Could not save the last reading location.", error);
      }
    };
    const scheduleSave = () => {
      if (savePending) return;
      savePending = true;
      window.requestAnimationFrame(saveVisibleParagraph);
    };

    window.addEventListener("scroll", scheduleSave, { passive: true });
    window.addEventListener("pagehide", saveVisibleParagraph);
    saveVisibleParagraph();
  }

  function initializeShareButton() {
    const article = document.querySelector("article.reader-content");
    const actions = document.querySelector(".reader-toolbar-actions");
    if (!article || !actions || typeof navigator.share !== "function" ||
        actions.querySelector(".reader-share-button")) return;

    const paragraphs = paragraphsIn(article);
    const button = document.createElement("button");
    button.className = "w3-bar-item w3-button reader-nav-button reader-share-button";
    button.type = "button";
    button.title = "Share this location";
    button.setAttribute("aria-label", "Share this location");
    button.innerHTML = '<i class="material-icons md-lit" aria-hidden="true">share</i>';
    const status = document.createElement("span");
    status.className = "reader-share-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    actions.append(button, status);
    button.addEventListener("click", async () => {
      const destination = new URL(window.location.href);
      const paragraph = visibleParagraph(paragraphs);
      if (paragraph) destination.hash = paragraph.id;
      try {
        await navigator.share({ title: document.title, url: destination.href });
      } catch (error) {
        if (error.name === "AbortError") return;
        console.error("Could not share this reading location.", error);
        status.textContent = "Could not share this reading location.";
      }
    });
  }

  window.initializeReaderSettings = function (drawer) {
    if (!document.body || !drawer) return;
    if (!dialog) {
      createDialog();
      loadSettings();
      applySettings();
      syncControls();
      initializeLastLocation();
    }
    initializeFontSizePinch();
    initializeShareButton();
    addSettingsButton(drawer);
  };

  document.addEventListener("DOMContentLoaded", () => {
    const drawer = document.getElementById("sidebar");
    if (drawer) window.initializeReaderSettings(drawer);
  });
})();
