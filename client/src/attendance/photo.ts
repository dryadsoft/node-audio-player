export type Corner = { x: number; y: number };
export const fullCorners: Corner[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];
export function projection(c: Corner[]) {
  if (
    c.length !== 4 ||
    c.some(
      (p) =>
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        p.x < 0 ||
        p.x > 1 ||
        p.y < 0 ||
        p.y > 1
    )
  )
    throw new Error("종이의 네 모서리를 확인하세요.");
  for (let i = 0; i < 4; i++) {
    const a = c[i],
      b = c[(i + 1) % 4],
      d = c[(i + 2) % 4];
    if ((b.x - a.x) * (d.y - b.y) - (b.y - a.y) * (d.x - b.x) < 0.002)
      throw new Error("모서리가 교차하거나 영역이 너무 작습니다.");
  }
  const [a, b, d, e] = c,
    dx1 = b.x - d.x,
    dx2 = e.x - d.x,
    dx3 = a.x - b.x + d.x - e.x,
    dy1 = b.y - d.y,
    dy2 = e.y - d.y,
    dy3 = a.y - b.y + d.y - e.y;
  const denominator = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(denominator) < 1e-8)
    throw new Error("사진 영역이 너무 작습니다.");
  const g = (dx3 * dy2 - dx2 * dy3) / denominator,
    h = (dx1 * dy3 - dx3 * dy1) / denominator;
  return [
    b.x - a.x + g * b.x,
    e.x - a.x + h * e.x,
    a.x,
    b.y - a.y + g * b.y,
    e.y - a.y + h * e.y,
    a.y,
    g,
    h,
  ];
}
export function decodePhoto(file: Blob): Promise<HTMLImageElement> {
  if (file.size > 25 * 1024 * 1024)
    return Promise.reject(new Error("25MiB 이하 사진을 선택하세요."));
  if (
    file.type === "application/pdf" ||
    file.type === "image/svg+xml" ||
    (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) && file.type !== "")
  )
    return Promise.reject(new Error("JPEG·PNG·WebP 사진을 선택하세요."));
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      if (
        !image.naturalWidth ||
        image.naturalWidth * image.naturalHeight > 50000000
      )
        reject(new Error("50메가픽셀 이하 사진을 선택하세요."));
      else resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new Error(
          "사진을 열 수 없습니다. HEIC 사진은 JPEG로 변환해 가져오세요."
        )
      );
    };
    image.src = url;
  });
}
export function rotatedCanvas(image: HTMLImageElement, rotation: number) {
  const scale = Math.min(
      1,
      4096 / Math.max(image.naturalWidth, image.naturalHeight)
    ),
    w = Math.round(image.naturalWidth * scale),
    h = Math.round(image.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = rotation % 180 ? h : w;
  canvas.height = rotation % 180 ? w : h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(image, -w / 2, -h / 2, w, h);
  return canvas;
}
export async function preparePhoto(
  canvas: HTMLCanvasElement,
  corners: Corner[]
): Promise<{ blob: Blob; width: number; height: number }> {
  const matrix = projection(corners),
    distance = (a: Corner, b: Corner) =>
      Math.hypot((a.x - b.x) * canvas.width, (a.y - b.y) * canvas.height);
  let width = Math.round(
      Math.max(
        distance(corners[0], corners[1]),
        distance(corners[3], corners[2])
      )
    ),
    height = Math.round(
      Math.max(
        distance(corners[0], corners[3]),
        distance(corners[1], corners[2])
      )
    );
  const scale = Math.min(1, 4096 / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);
  if (width < 100 || height < 100 || width / height < 0.2 || width / height > 5)
    throw new Error("종이 전체가 포함되도록 모서리를 맞춰주세요.");
  const source = canvas
    .getContext("2d")!
    .getImageData(0, 0, canvas.width, canvas.height);
  const worker = new Worker(
    `${process.env.PUBLIC_URL}/attendance-photo-worker.js`
  );
  const pixels = await new Promise<Uint8ClampedArray>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("사진 보정 시간이 초과됐습니다. 다시 시도하세요."));
    }, 60000);
    worker.onmessage = (e) => {
      window.clearTimeout(timer);
      worker.terminate();
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(new Uint8ClampedArray(e.data.buffer));
    };
    worker.onerror = () => {
      window.clearTimeout(timer);
      worker.terminate();
      reject(
        new Error(
          "사진 보정 기능을 준비하지 못했습니다. 온라인에서 앱을 다시 열어주세요."
        )
      );
    };
    worker.postMessage(
      {
        buffer: source.data.buffer,
        sourceWidth: canvas.width,
        sourceHeight: canvas.height,
        width,
        height,
        matrix,
      },
      [source.data.buffer]
    );
  });
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const ctx = output.getContext("2d")!,
    result = ctx.createImageData(width, height);
  result.data.set(pixels);
  ctx.putImageData(result, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    output.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("사진을 저장할 수 없습니다."))),
      "image/jpeg",
      0.92
    )
  );
  if (blob.size > 8 * 1024 * 1024)
    throw new Error(
      "보정한 사진이 8MiB를 초과합니다. 더 작은 사진으로 다시 시도하세요."
    );
  return { blob, width, height };
}
