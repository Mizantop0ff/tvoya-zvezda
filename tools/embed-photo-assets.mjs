/* Печём локальные фото в payload без публичных URL.
   Запуск: node tools/embed-photo-assets.mjs */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const photos = [
  ["you", ".private-photos/you-sm.jpg", ".private-photos/you.jpg"],
  ["mine", ".private-photos/mine-sm.jpg", ".private-photos/mine.jpg"],
  ["most", ".private-photos/most-sm.jpg", ".private-photos/most.jpg"],
  ["home", ".private-photos/home-sm.jpg", ".private-photos/home.jpg"],
  ["love", ".private-photos/love-sm.jpg", ".private-photos/love.jpg"],
];

const encoded = Object.fromEntries(
  photos.map(([id, small, full]) => [
    id,
    {
      t: "a2",
      s: readFileSync(resolve(root, small)).toString("base64"),
      f: readFileSync(resolve(root, full)).toString("base64"),
    },
  ])
);

const body = `/* Собрано локальными инструментами. Не добавляйте сюда ручные правки. */\n` +
  `window.__giftMedia = ${JSON.stringify({ v: 1, photos: encoded })};\n`;

writeFileSync(resolve(root, "assets/media.js"), body);
console.log(`assets/media.js: ${(Buffer.byteLength(body) / 1024 / 1024).toFixed(2)} MB`);
