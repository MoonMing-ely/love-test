import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(
  new URL("../js/about-navigation-stack.js", import.meta.url),
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
  "about.html?view=project&from=text.html",
);
assert.equal(
  normalizeRoute("https://example.test/outside.html", "https://example.test/html/text.html"),
  null,
);

const navigationStorage = createStorage();
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
  "about.html?view=project&from=text.html",
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
assert.equal(projectToQuestion.href, "text.html");
projectToQuestion.click();

const emptiedStack = new NavigationStack(navigationStorage);
assert.equal(emptiedStack.size, 0);

console.log("About navigation stack tests passed.");
