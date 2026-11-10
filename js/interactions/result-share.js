(function () {
  "use strict";

  const frame = document.querySelector(".result-frame");
  const content = document.querySelector(".result-content");
  const button = document.querySelector("#share-result");
  const status = document.querySelector("#share-status");
  const preview = document.querySelector("#share-preview");
  const previewStatus = document.querySelector("#share-preview-status");
  const image = document.querySelector("#share-image");
  const save = document.querySelector("#save-result-image");
  let imageUrl = null;

  button.disabled = frame.dataset.resultState === "empty";
  if (button.disabled) button.title = "完成测试后即可分享结果截图";

  function releaseImage() {
    image.removeAttribute("src");
    save.removeAttribute("href");
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = null;
  }

  async function capture() {
    await document.fonts.ready;
    const contentWidth = content.getBoundingClientRect().width;
    const style = getComputedStyle(content);
    const originalPadding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const sideSpace = 24;
    const topSpace = 40;
    const bottomSpace = 24;
    const width = Math.ceil(contentWidth + sideSpace * 2);
    const height = Math.ceil(content.scrollHeight - originalPadding + topSpace + bottomSpace);
    // 截取完整内容节点，不把父页面的页眉、页脚和导航绘入图片。
    const scale = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(12000000 / (width * height)), 16384 / height);
    return window.html2canvas(content, {
      width, height, scale,
      backgroundColor: "#ffffff", logging: false,
      scrollX: 0, scrollY: 0,
      onclone(clone) {
        const clonedContent = clone.querySelector(".result-content");
        Object.assign(clonedContent.style, {
          position: "relative", left: "auto", top: "0", bottom: "auto", transform: "none",
          width: `${width}px`, maxWidth: "none", height: "auto", minHeight: "0", maxHeight: "none",
          margin: "0", paddingTop: `${topSpace}px`, paddingBottom: `${bottomSpace}px`,
          paddingLeft: `${(parseFloat(style.paddingLeft) || 0) + sideSpace}px`,
          paddingRight: `${(parseFloat(style.paddingRight) || 0) + sideSpace}px`,
          boxSizing: "border-box", flexShrink: "0", overflow: "visible", outline: "none", background: "#ffffff",
        });
        clonedContent.scrollTop = 0;
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
      image.src = imageUrl;
      save.href = imageUrl;
      save.download = filename;
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

  document.querySelector("#close-share-preview").addEventListener("click", () => preview.close());
  preview.addEventListener("close", releaseImage);
  window.addEventListener("pagehide", releaseImage);
})();
