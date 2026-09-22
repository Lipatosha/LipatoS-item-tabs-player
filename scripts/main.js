const MODULE_ID = "lipatos-item-tabs-player";
const VERSION = "1.1.0";

function isPlayer() {
  return !!game.user && !game.user.isGM;
}

function getRoot(app, html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  if (app?.element instanceof HTMLElement) return app.element;
  if (app?.element?.[0] instanceof HTMLElement) return app.element[0];
  return null;
}

function isItemApp(app) {
  const doc = app?.document ?? app?.item ?? app?.object;
  return doc?.documentName === "Item" || doc instanceof Item;
}

const KEEP_WORDS = ["описание", "функции", "description", "activities", "activity"];
const HIDE_WORDS = ["подробности", "эффекты", "details", "effects"];

function norm(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function classifyTab(el) {
  const dataTab = norm(el.dataset?.tab);
  const text = norm(el.textContent);
  const title = norm(el.getAttribute?.("title"));
  const label = `${dataTab} ${text} ${title}`;

  if (KEEP_WORDS.some(w => label.includes(w))) return "keep";
  if (HIDE_WORDS.some(w => label.includes(w))) return "hide";
  return null;
}

function findDescriptionTab(root) {
  const tabs = root.querySelectorAll('[data-tab], nav a, nav button, .tabs a, .tabs button');
  for (const tab of tabs) {
    const label = `${norm(tab.dataset?.tab)} ${norm(tab.textContent)} ${norm(tab.getAttribute?.("title"))}`;
    if (label.includes("описание") || label.includes("description")) return tab;
  }
  return null;
}

function apply(root) {
  if (!isPlayer() || !root) return;

  let hiddenActive = false;
  const candidates = root.querySelectorAll('[data-tab], nav a, nav button, .tabs a, .tabs button');

  for (const el of candidates) {
    const cls = classifyTab(el);
    if (cls !== "hide") continue;

    if (el.classList.contains("active") || el.getAttribute("aria-selected") === "true") hiddenActive = true;
    el.style.setProperty("display", "none", "important");
    el.setAttribute("aria-hidden", "true");
    el.tabIndex = -1;
  }

  const panels = root.querySelectorAll('[data-tab]');
  for (const panel of panels) {
    const tag = panel.tagName?.toLowerCase();
    if (tag === "a" || tag === "button") continue;
    if (classifyTab(panel) === "hide") {
      panel.style.setProperty("display", "none", "important");
      panel.setAttribute("aria-hidden", "true");
      if (panel.classList.contains("active")) hiddenActive = true;
    }
  }

  if (hiddenActive) {
    const desc = findDescriptionTab(root);
    desc?.click();
  }
}

function isBlockedActivityMenuEntry(entry) {
  const label = norm(entry?.label);
  const icon = norm(entry?.icon);

  const blockedLabelKeys = [
    "dnd5e.contextmenuactionedit",
    "dnd5e.contextmenuactionduplicate",
    "dnd5e.contextmenuactiondelete"
  ];

  if (blockedLabelKeys.some(key => label.includes(key))) return true;

  const blockedWords = [
    "редактировать", "изменить", "дублировать", "удалить",
    "edit", "duplicate", "delete"
  ];
  if (blockedWords.some(word => label.includes(word))) return true;

  return ["fa-pen-to-square", "fa-copy", "fa-trash"].some(cls => icon.includes(cls));
}

function patchActivityContextMenus() {
  const types = CONFIG?.DND5E?.activityTypes;
  if (!types) return;

  const classes = new Set(
    Object.values(types)
      .map(config => config?.documentClass)
      .filter(cls => typeof cls === "function")
  );

  for (const cls of classes) {
    const proto = cls.prototype;
    if (!proto || proto._lipatosPlayerActivityMenuPatched) continue;

    const original = proto.getContextMenuOptions;
    if (typeof original !== "function") continue;

    Object.defineProperty(proto, "_lipatosPlayerActivityMenuPatched", {
      value: true,
      configurable: true
    });

    proto.getContextMenuOptions = function (...args) {
      const entries = original.apply(this, args) ?? [];
      if (!isPlayer()) return entries;
      return entries.filter(entry => !isBlockedActivityMenuEntry(entry));
    };
  }
}

function patch(app, html) {
  if (!isPlayer() || !isItemApp(app)) return;
  const root = getRoot(app, html);
  if (!root) return;

  patchActivityContextMenus();

  const run = () => apply(root);
  run();

  if (!root._lipatosItemTabsObserver) {
    const observer = new MutationObserver(() => queueMicrotask(run));
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "aria-selected"]
    });
    root._lipatosItemTabsObserver = observer;
  }
}

Hooks.once("init", patchActivityContextMenus);
Hooks.once("ready", patchActivityContextMenus);

Hooks.on("renderItemSheet", patch);
Hooks.on("renderItemSheetV2", patch);
Hooks.on("renderApplicationV2", patch);

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | ${VERSION} ready`);
});
