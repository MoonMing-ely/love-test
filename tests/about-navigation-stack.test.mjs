import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(
  new URL("../js/interactions/about-navigation-stack.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({ URL });
vm.runInContext(source, context);

const { NavigationStack, normalizeRoute } = context.AboutNavigationStack;

function createStorage(initialValue = null) {
  const values = new Map();
  if (initialValue !== null) {
    values.set("loveTestAboutNavigationStackV1", initialValue);
  }
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

function createControl(href, active = false) {
  let clickListener = null;
  return {
    href,
    classList: {
      contains(className) {
        return className === "is-active" && active;
      },
    },
    addEventListener(type, listener) {
      if (type === "click") clickListener = listener;
    },
    click() {
      clickListener({
        defaultPrevented: false,
        button: 0,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
      });
    },
  };
}

function bindPage(storage, page, href, controls) {
  const pageNode = { dataset: { page } };
  const pageContext = vm.createContext({
    URL,
    document: {
      querySelectorAll() {
        return controls;
      },
      querySelector() {
        return pageNode;
      },
    },
    location: { href },
    sessionStorage: storage,
  });
  vm.runInContext(source, pageContext);
}

const stack = new NavigationStack(createStorage());
stack.reset("text.html");
stack.push("about.html?view=project&from=text.html");

assert.equal(stack.size, 2);
assert.equal(stack.peek(), "about.html?view=project&from=text.html");
assert.equal(stack.pop(), "about.html?view=project&from=text.html");
assert.equal(stack.pop(), "text.html");
assert.equal(stack.pop(), null);

const restored = new NavigationStack(
  createStorage(JSON.stringify(["result.html", "about.html?view=result&from=result.html"])),
);
assert.equal(restored.peek(), "about.html?view=result&from=result.html");

const malformed = new NavigationStack(createStorage("not-json"));
assert.equal(malformed.size, 0);

assert.equal(
  normalizeRoute(
    "https://example.test/html/about.html?view=project&from=text.html",
    "https://example.test/html/text.html",
  ),
  "/html/about.html?view=project&from=text.html",
);
assert.equal(
  normalizeRoute("https://example.test/outside.html", "https://example.test/html/text.html"),
  null,
);

const navigationStorage = createStorage();
assert.equal(
  normalizeRoute("text.html?restart=1&mode=test#question", "https://example.test/html/text.html"),
  "/html/text.html?mode=test#question",
);
const openProject = createControl(
  "https://example.test/html/about.html?view=project&from=text.html",
);
const openResult = createControl(
  "https://example.test/html/about.html?view=result&from=text.html",
);
bindPage(
  navigationStorage,
  "question",
  "https://example.test/html/text.html",
  [openProject, openResult],
);
openProject.click();

const closeProject = createControl("https://example.test/html/text.html", true);
const projectToResult = createControl(
  "https://example.test/html/about.html?view=result&from=text.html",
);
bindPage(
  navigationStorage,
  "about",
  "https://example.test/html/about.html?view=project&from=text.html",
  [closeProject, projectToResult],
);
projectToResult.click();

const resultToProject = createControl(
  "https://example.test/html/text.html",
  true,
);
const resultToProjectSibling = createControl(
  "https://example.test/html/about.html?view=project&from=text.html",
);
bindPage(
  navigationStorage,
  "about",
  "https://example.test/html/about.html?view=result&from=text.html",
  [resultToProjectSibling, resultToProject],
);
assert.equal(
  resultToProject.href,
  "/html/about.html?view=project&from=text.html",
);
resultToProject.click();

const projectToQuestion = createControl(
  "https://example.test/html/text.html",
  true,
);
bindPage(
  navigationStorage,
  "about",
  "https://example.test/html/about.html?view=project&from=text.html",
  [projectToQuestion, createControl("about.html?view=result&from=text.html")],
);
assert.equal(projectToQuestion.href, "/html/text.html");
projectToQuestion.click();

const emptiedStack = new NavigationStack(navigationStorage);
assert.equal(emptiedStack.size, 0);

// Binding happens before quiz.js finishes loading and removes restart from the address.
const restartStorage = createStorage();
const restartedToProject = createControl("https://example.test/html/about.html?view=project&from=text.html");
bindPage(restartStorage, "question", "https://example.test/html/text.html?restart=1", [restartedToProject]);
restartedToProject.click();
assert.equal(new NavigationStack(restartStorage).peek(), "/html/text.html");
const returnToRestartedQuiz = createControl("https://example.test/html/text.html", true);
bindPage(restartStorage, "about", "https://example.test/html/about.html?view=project&from=text.html", [returnToRestartedQuiz]);
assert.equal(returnToRestartedQuiz.href, "/html/text.html");
returnToRestartedQuiz.click();
assert.equal(returnToRestartedQuiz.href, "/html/text.html");

// Already persisted navigation stacks must also be safe for return-animation preloads.
const oldRestartStorage = createStorage(JSON.stringify(["text.html?restart=1"]));
const oldReturn = createControl("https://example.test/html/text.html", true);
bindPage(oldRestartStorage, "about", "https://example.test/html/about.html?view=result&from=text.html", [oldReturn]);
assert.equal(oldReturn.href, "/html/text.html");
oldReturn.click();
assert.equal(oldReturn.href, "/html/text.html");

console.log("About navigation stack tests passed.");

// 首页已移动到网站根目录；存储的旧文件名也须转换为完整站内路径。
for (const [route, expected] of [
  ["https://example.test/", "/index.html"],
  ["https://example.test/index.html?mode=test#top", "/index.html?mode=test#top"],
  ["index.html", "/index.html"],
  ["/html/text.html?restart=1&mode=test#question", "/html/text.html?mode=test#question"],
  ["https://outside.test/html/text.html", null],
]) {
  assert.equal(normalizeRoute(route, "https://example.test/html/about.html"), expected);
}
for (const homeUrl of ["https://example.test/", "https://example.test/index.html"]) {
  const storage = createStorage();
  const open = createControl("https://example.test/html/about.html?view=project&from=index.html");
  bindPage(storage, "start", homeUrl, [open]);
  open.click();
  assert.equal(new NavigationStack(storage).peek(), "/index.html");
  const close = createControl("https://example.test/index.html", true);
  bindPage(storage, "about", "https://example.test/html/about.html?view=project&from=index.html", [close]);
  assert.equal(close.href, "/index.html");
  close.click();
  assert.equal(close.href, "/index.html");
}
const legacyHome = createStorage(JSON.stringify(["index.html"]));
const legacyReturn = createControl("https://example.test/index.html", true);
bindPage(legacyHome, "about", "https://example.test/html/about.html", [legacyReturn]);
assert.equal(legacyReturn.href, "/index.html");
