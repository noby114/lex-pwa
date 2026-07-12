// Minimal hash-based SPA router. No build step / framework needed -- each
// screen module exports an async render(container, params) that replaces
// the #screen contents and wires up its own event listeners.

const routes = new Map();
let tabbarEl = null;
let screenEl = null;
let lastTabRoute = "home";
const TAB_ROUTES = new Set(["home", "add", "words", "stats", "account"]);

export function registerRoute(name, render) {
  routes.set(name, render);
}

export function initRouter(screenElement, tabbarElement) {
  screenEl = screenElement;
  tabbarEl = tabbarElement;
  window.addEventListener("hashchange", handleRoute);
  handleRoute();
}

export function navigate(path) {
  if (location.hash === `#/${path}`) {
    handleRoute();
  } else {
    location.hash = `#/${path}`;
  }
}

export function goBack() {
  navigate(lastTabRoute);
}

async function handleRoute() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [routeName, param] = hash.split("/");
  const name = routeName || "home";

  if (TAB_ROUTES.has(name)) {
    lastTabRoute = name;
    tabbarEl.classList.remove("hidden");
    highlightTab(name);
  } else {
    tabbarEl.classList.add("hidden");
  }

  const render = routes.get(name) ?? routes.get("home");
  screenEl.scrollTop = 0;
  screenEl.innerHTML = "";
  await render(screenEl, { param });
}

function highlightTab(name) {
  tabbarEl.querySelectorAll(".tab").forEach((el) => {
    el.classList.toggle("active", el.dataset.route === name);
  });
}
