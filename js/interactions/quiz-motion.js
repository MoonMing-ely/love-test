(function () {
  "use strict";

  // 沿用原来的小幅抽卡／归位，只管理视觉与数据交接时机。
  window.QuizMotion = {
    create({ panel, card }) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
      const wait = ms => new Promise(resolve => window.setTimeout(resolve, ms));
      let sequence = 0;
      let animations = [];

      function cancel() {
        sequence += 1;
        animations.forEach(animation => animation.cancel());
        animations = [];
      }

      function change(update, direction = 1, { confirmation = false } = {}) {
        cancel();
        const id = sequence;
        if (reduced.matches || typeof card.animate !== "function") {
          if (!confirmation) { update(); return Promise.resolve(); }
          return wait(80).then(update);
        }

        const easing = getComputedStyle(panel).getPropertyValue("--quiz-motion-ease").trim();
        const animate = (frames, duration, fill) => {
          const animation = card.animate(frames, { duration, easing, fill });
          animations.push(animation);
          return animation.finished.catch(() => {});
        };
        const rest = { transform: "none", opacity: 1 };
        return (async () => {
          // 点击就开始抽出，不增加静止等待，也不生成第二张大幅横滑的卡。
          await animate([rest, {
            transform: `translate(${-14 * direction}px, -3px)`, opacity: 0,
          }], 160, "forwards");
          const continuing = update();
          if (id !== sequence) return;
          if (continuing === false) { cancel(); return; }
          // 在同一张卡上交接内容，取消退场残留后，从原有的小幅偏移归位。
          animations.forEach(animation => animation.cancel());
          animations = [];
          animate([{
            transform: `translate(${14 * direction}px, 3px)`, opacity: 0,
          }, rest], 220, "none").then(() => {
            if (id === sequence) cancel();
          });
          await wait(120);
        })().catch(error => {
          if (id === sequence) cancel();
          throw error;
        });
      }

      reduced.addEventListener?.("change", cancel);
      window.addEventListener("resize", cancel, { passive: true });
      window.addEventListener("pagehide", cancel);
      return { change, cancel };
    },
  };
})();
