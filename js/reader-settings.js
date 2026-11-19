"use strict";

(() => {
  const storageKey = "literature.org.readerSettings";
  const defaults = { width: "normal", font: "open-sans", size: "medium", theme: "system" };
  const allowed = {
    width: ["narrow", "normal", "wide"],
    font: ["open-sans", "karla", "georgia", "times", "arial", "verdana", "opendyslexic"],
    size: ["small", "medium", "large"],
    theme: ["light", "dark", "system"]
  };
  let settings = { ...defaults };
  let dialog;
  let status;

  function isAllowed(key, value) {
    return allowed[key].includes(value);
  }

  function applySettings() {
    const root = document.documentElement;
    root.dataset.readerWidth = settings.width;
    root.dataset.readerFont = settings.font;
    root.dataset.readerSize = settings.size;
    root.dataset.readerTheme = settings.theme;
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
        if (isAllowed(key, parsed[key])) settings[key] = parsed[key];
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

  function syncControls() {
    dialog.querySelectorAll("[name]").forEach((control) => {
      if (control.type === "radio") {
        control.checked = control.value === settings[control.name];
      } else {
        control.value = settings[control.name];
      }
    });
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
      <label class="reader-settings-field" for="reader-settings-size">Font size</label>
      <select id="reader-settings-size" name="size">
        <option value="small">Small</option>
        <option value="medium">Medium (default)</option>
        <option value="large">Large</option>
      </select>
      <label class="reader-settings-field" for="reader-settings-theme">Theme</label>
      <select id="reader-settings-theme" name="theme">
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">Follow browser / system</option>
      </select>
      <p class="reader-settings-privacy">Your reading settings are stored only in this browser and are never sent to literature.org. <a href="#" class="reader-settings-reset-link">Reset to defaults</a>.</p>
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
      if (!control.name || !isAllowed(control.name, control.value)) return;
      settings[control.name] = control.value;
      applySettings();
      saveSettings();
    });
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

  window.initializeReaderSettings = function (drawer) {
    if (!document.body || !drawer) return;
    if (!dialog) {
      createDialog();
      loadSettings();
      applySettings();
      syncControls();
    }
    addSettingsButton(drawer);
  };

  document.addEventListener("DOMContentLoaded", () => {
    const drawer = document.getElementById("sidebar");
    if (drawer) window.initializeReaderSettings(drawer);
  });
})();
