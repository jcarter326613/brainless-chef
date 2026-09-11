# Recipe inference worker

The worker processes one Firestore inference job identified by `JOB_ID`. Its container
includes the official Apache-2.0 Qwen2.5 1.5B Instruct Q4_K_M GGUF and runs it locally on CPU with
`node-llama-cpp`; normal executions do not download model files.

The model is pinned to Hugging Face revision
`91cad51170dc346986eccefdc2dd33a9da36ead9` and SHA-256
`6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e`.
Its Apache 2.0 model license is copied to `/models/MODEL-LICENSE` in the image.

Required environment variables:

- `FIRESTORE_DATABASE_ID`
- `JOB_ID`
- `MODEL_PATH`

Run `node apps/worker/dist/benchmark.js` inside the built image to load the bundled
model and time one grammar-constrained extraction without Firestore.

The initial cold local Docker benchmark completed the included flatbread sample in
17.2 seconds with 8 logical CPUs and a 7 GiB container memory limit. This is not a
Cloud Run measurement, and the 1.5B model's semantic output still requires evaluation
against representative pasted recipes before production use.
