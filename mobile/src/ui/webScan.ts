import jsQR from "jsqr";
// Browser dev mode only: scans a QR code with the webcam. Loaded lazily so the
// Android bundle does not run it.
export function scanWithWebcam(): Promise<string | null> {
  return new Promise<string | null>((resolve, reject) => {
    const video = document.createElement("video");
    video.setAttribute("playsinline", "");
    video.muted = true;
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    const overlay = document.createElement("div");
    overlay.className = "webcam";
    overlay.append(video, cancel);
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    const finish = (value: string | null) => {
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      overlay.remove();
      resolve(value);
    };
    cancel.onclick = () => finish(null);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then(async (s) => {
        stream = s;
        video.srcObject = s;
        document.body.appendChild(overlay);
        await video.play();
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        timer = setInterval(() => {
          if (!ctx || video.videoWidth === 0) return;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height);
          if (code && code.data) finish(code.data);
        }, 250);
      })
      .catch((e) => {
        finish(null);
        reject(e);
      });
  });
}
