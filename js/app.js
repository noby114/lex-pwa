import { registerRoute, initRouter, navigate } from "./router.js";
import { icon } from "./icons.js";
import * as home from "./screens/home.js";
import * as addWord from "./screens/addWord.js";
import * as wordList from "./screens/wordList.js";
import * as stats from "./screens/stats.js";
import * as account from "./screens/account.js";
import * as studySession from "./screens/studySession.js";
import * as wordDetail from "./screens/wordDetail.js";

registerRoute("home", home.render);
registerRoute("add", addWord.render);
registerRoute("words", wordList.render);
registerRoute("stats", stats.render);
registerRoute("account", account.render);
registerRoute("study", studySession.render);
registerRoute("word", wordDetail.render);

const TABS = [
  { route: "home", label: "ホーム", iconName: "home" },
  { route: "add", label: "追加", iconName: "add" },
  { route: "words", label: "一覧", iconName: "list" },
  { route: "stats", label: "統計", iconName: "chart" },
  { route: "account", label: "アカウント", iconName: "person" },
];

const tabbar = document.getElementById("tabbar");
tabbar.innerHTML = TABS.map(
  (t) => `
    <button class="tab" data-route="${t.route}">
      ${icon(t.iconName, { size: 22 })}
      <span>${t.label}</span>
    </button>`
).join("");

tabbar.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => navigate(btn.dataset.route));
});

initRouter(document.getElementById("screen"), tabbar);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {
      // Offline support is a nice-to-have -- ignore registration failures
      // (e.g. running from file:// during local testing).
    });
  });
}
