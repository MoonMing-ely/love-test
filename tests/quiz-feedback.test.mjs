import assert from "node:assert/strict";
import test from "node:test";
import { quizHarness } from "./helpers/quiz-harness.mjs";

test("按下即反馈，滑走或触摸取消不记答案，非主指针不触发", async () => {
  const quiz = await quizHarness();
  const button = quiz.buttons[0];
  for (const type of ["pointerleave", "pointercancel", "pointerup", "lostpointercapture"]) {
    button.dispatch("pointerdown", { isPrimary: true, button: 0 });
    assert.ok(button.classList.contains("is-pressing"));
    assert.equal(quiz.state().answers.length, 0);
    button.dispatch(type);
    assert.equal(button.classList.contains("is-pressing"), false);
    assert.equal(quiz.state().answers.length, 0);
  }
  button.dispatch("pointerdown", { isPrimary: false, button: 0 });
  assert.equal(button.classList.contains("is-pressing"), false);
  button.dispatch("pointerdown", { isPrimary: true, button: 2 });
  assert.equal(button.classList.contains("is-pressing"), false);
});

test("点击同步显示选择，等待期间重复激活不多记答案，换题清理反馈", async () => {
  const timers = [];
  const quiz = await quizHarness({ timers });
  const button = quiz.buttons[2];
  const answer = button.click();
  assert.ok(button.classList.contains("is-selected"), "不能等定时器后才显示选中");
  assert.equal(button.getAttribute("aria-pressed"), "true");
  assert.ok(quiz.buttons.every(item => item.disabled));
  quiz.buttons[0].click();
  button.dispatch("click");
  assert.equal(timers.length, 1, "重复输入不能排入第二次提交");
  assert.equal(quiz.state().answers.length, 0);
  assert.equal(timers[0].duration, 80);
  timers.shift().callback();
  await answer;
  assert.equal(quiz.state().answers.length, 1);
  assert.equal(quiz.state().currentQuestionIndex, 1);
  assert.equal(button.classList.contains("is-selected"), false);
  assert.equal(button.classList.contains("is-pressing"), false);
  assert.ok(quiz.buttons.every(item => !item.disabled));
});
