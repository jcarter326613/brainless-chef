# Recipe inference worker

The worker processes one Firestore inference job identified by `JOB_ID`. Its container
includes the official Apache-2.0 Qwen2.5 7B Instruct Q4_K_M GGUF and runs it on Cloud Run CPU with
`node-llama-cpp`; normal executions do not download model files.

The model is pinned to Hugging Face revision
`bb5d59e06d9551d752d08b292a50eb208b07ab1f`. The official quantization is split into
two GGUF files, both included unmodified in the image and verified during its build:

- `qwen2.5-7b-instruct-q4_k_m-00001-of-00002.gguf`: `dfce12e3862a5283ccfb88221b48480e58745165de856439950d0f22590580db`
- `qwen2.5-7b-instruct-q4_k_m-00002-of-00002.gguf`: `539cf93f78e887edea1c04e2d7d8cdaca9d01dae9c9025bcb8accbe29df3d72a`

`node-llama-cpp` loads the first part and discovers the second part beside it. The Apache 2.0 model
license is copied to `/models/MODEL-LICENSE` in the image.

Required environment variables:

- `FIRESTORE_DATABASE_ID`
- `JOB_ID`
- `MODEL_PATH`

The worker converts pasted recipes through three constrained model stages: grounded fact extraction,
catalog ingredient resolution, and prep/cook material-flow planning. Deterministic code assigns IDs,
derives graph dependencies, computes exact ingredient fractions, validates the recipe schema, and
writes the recipe and catalog ingredients atomically before marking the inference job successful.
The completed job exposes `recipeId`; raw model output is not persisted.

Never build the worker image locally. GitHub Actions builds and evaluates it against the bundled
model on feature-branch pushes that change worker image inputs. The deployment workflow performs
the same evaluation when it builds a new worker image for `main`, checking the flatbread fixture's
catalog ingredients and material graph before it pushes the image.

Add model evaluation scenarios as entries in `src/evaluate.ts`'s `evaluationCases` array. Each
case defines source text, expected catalog ingredients, and minimum graph characteristics.
