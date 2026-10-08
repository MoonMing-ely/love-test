import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { runnableBank, seededRandom } from "./question-fixtures.mjs";

const paths = ["question-sampler.js", "core-algorithm/dimension-vector.js", "core-algorithm/second-layer-normalizer.js",
  "core-algorithm/third-layer-aggregator.js", "core-algorithm/algorithm-config.js", "core-algorithm/fourth-layer-evidence.js",
  "core-algorithm/fifth-layer-mechanisms.js", "core-algorithm/sixth-layer-integration.js", "scoring.js", "interactions/quiz.js"];
const scripts = await Promise.all(paths.map((path) => readFile(new URL(`../../js/${path}`, import.meta.url), "utf8")));
export const STATE_KEY = "deceptionIndexQuizStateV3";
export const RESULT_KEY = "deceptionIndexQuizResultV3";

function element(dataset = {}) {
  const listeners = new Map();
  const attributes = new Map();
  return { dataset, disabled: false, textContent: "", classList: { add() {}, remove() {} }, setAttribute(key, value) { attributes.set(key, value); }, getAttribute(key) { return attributes.get(key); },
    addEventListener(type, callback) { listeners.set(type, callback); },
    click() { if (!this.disabled) return listeners.get("click")?.(); },
    dispatch(type, event = {}) { return listeners.get(type)?.(event); },
  };
}

export async function quizHarness({ data = runnableBank(), storage = new Map(), failStorage = () => false,
  failFetch = false, seed = 7, search = "" } = {}) {
  const panel = element({ resultPage: "result.html" });
  const buttons = Array.from({ length: 4 }, () => element());
  const previous = element();
  const forward = element();
  const slot = element();
  const prompt = element();
  const counter = element();
  const status = element();
  const progress = element();
  const progressBar = element();
  const errors = [];
  let storageCalls = 0;
  const math = Object.create(Math);
  math.random = seededRandom(seed);
  const context = vm.createContext({ Math: math, URLSearchParams,
    console: { error(error) { errors.push(error); } },
    document: {
      querySelector(selector) {
        return { "[data-result-page]": panel, ".question-slot": slot, ".options-grid": element(),
          ".question-prompt": prompt, "#question-counter": counter,
          "#progress-label": progress, "#quiz-progress": progressBar, "#quiz-status": status, "#quiz-previous": previous, "#quiz-forward": forward }[selector];
      },
      querySelectorAll() { return buttons; },
    },
    fetch: async () => { if (failFetch) throw new Error("network error"); return { ok: true, json: async () => data }; },
    location: { href: "text.html", search }, history: { replaceState() {} },
    matchMedia: () => ({ matches: true }), setTimeout(callback) { callback(); },
    sessionStorage: Object.fromEntries(["getItem", "setItem", "removeItem"].map((action) => [action, (key, value) => {
      storageCalls += 1;
      if (failStorage(action, key, storageCalls)) throw new Error("storage error");
      if (action === "getItem") return storage.get(key) ?? null;
      if (action === "setItem") storage.set(key, value);
      if (action === "removeItem") storage.delete(key);
    }])),
  });
  context.window = context;
  scripts.forEach((source) => vm.runInContext(source, context));
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  return { context, storage, panel, buttons, previous, forward, slot, prompt, counter, status, progress, progressBar, errors,
    state() { return JSON.parse(storage.get(STATE_KEY)); },
    async answer(index = 0) { await buttons[index].click(); },
  };
}
