(function () {
  "use strict";

  const page = document.querySelector(".result-page");
  const frame = document.querySelector(".result-frame");
  const content = document.querySelector(".result-content");
  const button = document.querySelector("#share-result");
  const status = document.querySelector("#share-status");
  const preview = document.querySelector("#share-preview");
  const previewStatus = document.querySelector("#share-preview-status");
  const image = document.querySelector("#share-image");
  const save = document.querySelector("#save-result-image");
  const share = document.querySelector("#share-result-image");
  let imageUrl = null;
  let file = null;

  button.disabled = frame.dataset.resultState === "empty";
  if (button.disabled) button.title = "完成测试后即可分享结果截图";

  function releaseImage() {
    image.removeAttribute("src");
    save.removeAttribute("href");
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = null;
    file = null;
  }

  async function capture() {
    await document.fonts.ready;
    const pageRect = page.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const contentTop = content.getBoundingClientRect().top - frameRect.top;
    const actions = page.querySelector(".result-actions");
    const actionsBottom = parseFloat(getComputedStyle(actions).bottom);
    const frameHeight = Math.ceil(Math.max(frameRect.height,
      contentTop + content.scrollHeight + 20 + actions.offsetHeight + actionsBottom + 8));
    const width = Math.ceil(pageRect.width);
    const height = Math.ceil(Math.max(pageRect.height, frameRect.top - pageRect.top + frameHeight + 24));
    // Bound both canvas area and longest side for long results on mobile browsers.
    const scale = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(12000000 / (width * height)), 16384 / height);
    return window.html2canvas(page, {
      width, height, scale,
      backgroundColor: getComputedStyle(page).getPropertyValue("--canvas").trim(), logging: false,
      scrollX: 0, scrollY: 0,
      onclone(clone) {
        const clonedPage = clone.querySelector(".result-page");
        const clonedFrame = clone.querySelector(".result-frame");
        const clonedContent = clone.querySelector(".result-content");
        Object.assign(clonedPage.style, { height: `${height}px`, minHeight: "0" });
        Object.assign(clonedFrame.style, {
          height: `${frameHeight}px`, minHeight: "0", maxHeight: "none", flexShrink: "0",
        });
        Object.assign(clonedContent.style, {
          top: `${contentTop}px`, bottom: "auto", height: "auto", maxHeight: "none", overflow: "visible",
        });
        clonedContent.scrollTop = 0;
        clone.querySelector(".result-actions").style.bottom = `${actionsBottom}px`;
        const clonedButton = clone.querySelector("#share-result");
        clonedButton.textContent = "分享结果";
        clonedButton.disabled = false;
        const freeze = clone.createElement("style");
        freeze.textContent = "*, *::before, *::after { animation: none !important; transition: none !important; }";
        clone.head.append(freeze);
      },
    });
  }

  button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = "生成截图中…";
    status.textContent = "";
    try {
      if (typeof window.html2canvas !== "function") throw new Error("截图库未加载");
      const canvas = await capture();
      const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => {
        if (value) resolve(value);
        else reject(new Error("截图生成失败"));
      }, "image/png"));
      releaseImage();
      imageUrl = URL.createObjectURL(blob);
      const filename = `情感测试结果-${Date.now()}.png`;
      file = new File([blob], filename, { type: "image/png" });
      image.src = imageUrl;
      save.href = imageUrl;
      save.download = filename;
      share.hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
      previewStatus.textContent = "完整结果已生成，可保存图片后手动分享，也可长按图片保存。";
      preview.showModal();
    } catch {
      releaseImage();
      status.textContent = "截图生成失败，请重试；也可以使用浏览器截图保存。";
    } finally {
      button.disabled = false;
      button.textContent = "分享结果";
    }
  });

  // A separate click preserves user activation after asynchronous rendering.
  share.addEventListener("click", async () => {
    if (!file) return;
    share.disabled = true;
    try {
      await navigator.share({ files: [file] });
    } catch (error) {
      if (error.name !== "AbortError") previewStatus.textContent = "此浏览器无法分享图片，请保存图片后手动发送。";
    } finally {
      share.disabled = false;
    }
  });
  document.querySelector("#close-share-preview").addEventListener("click", () => preview.close());
  preview.addEventListener("close", releaseImage);
  window.addEventListener("pagehide", releaseImage);
})();
