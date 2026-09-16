import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";

import { modelDirectory, modelFiles, modelPath, modelUrl } from "./local-model-config.js";

async function hashFile(path: string) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

async function hasExpectedFile(path: string, expectedHash: string) {
  try {
    await stat(path);
    return (await hashFile(path)) === expectedHash;
  } catch {
    return false;
  }
}

async function download(file: typeof modelFiles[number]) {
  const destination = join(modelDirectory, file.name);
  if (await hasExpectedFile(destination, file.sha256)) {
    console.error(`Verified ${file.name}`);
    return;
  }

  const temporary = `${destination}.partial`;
  await rm(temporary, { force: true });
  console.error(`Downloading ${file.name}`);
  const response = await fetch(modelUrl(file.name));
  if (!response.ok || !response.body) throw new Error(`Could not download ${file.name}: ${response.status} ${response.statusText}`);

  const hash = createHash("sha256");
  let downloaded = 0;
  let nextProgress = 256 * 1024 * 1024;
  const progress = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      downloaded += chunk.length;
      if (downloaded >= nextProgress) {
        console.error(`${file.name}: ${Math.floor(downloaded / 1024 / 1024)} MiB downloaded`);
        nextProgress += 256 * 1024 * 1024;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(Readable.fromWeb(response.body as never), progress, createWriteStream(temporary));
    if (hash.digest("hex") !== file.sha256) throw new Error(`Checksum mismatch for ${file.name}`);
    await rename(temporary, destination);
    console.error(`Verified ${file.name}`);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function setupLocalModel(): Promise<string> {
  await mkdir(modelDirectory, { recursive: true });
  for (const file of modelFiles) await download(file);
  return modelPath;
}
