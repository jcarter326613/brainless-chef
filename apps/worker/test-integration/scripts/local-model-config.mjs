import { homedir } from "node:os";
import { join } from "node:path";

export const modelRevision = "bb5d59e06d9551d752d08b292a50eb208b07ab1f";
export const modelDirectory = join(homedir(), ".cache", "brainless-chef", "models", modelRevision);
export const modelFiles = [
  {
    name: "qwen2.5-7b-instruct-q4_k_m-00001-of-00002.gguf",
    sha256: "dfce12e3862a5283ccfb88221b48480e58745165de856439950d0f22590580db",
  },
  {
    name: "qwen2.5-7b-instruct-q4_k_m-00002-of-00002.gguf",
    sha256: "539cf93f78e887edea1c04e2d7d8cdaca9d01dae9c9025bcb8accbe29df3d72a",
  },
];
export const modelPath = join(modelDirectory, modelFiles[0].name);

export const modelUrl = (name) =>
  `https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/${modelRevision}/${name}`;
