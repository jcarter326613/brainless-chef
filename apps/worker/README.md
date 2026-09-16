# Local Recipe Experiment

This package runs one hardcoded recipe-component prompt directly against the pinned Qwen2.5 7B Instruct Q4_K_M model on Apple Silicon with Metal acceleration. It has no API, Firestore, container, or deployment integration.

Run from `apps/worker`:

```sh
pnpm experiment:chatgpt-recipe
```

The command downloads and checksum-verifies the model in `~/.cache/brainless-chef/models` when needed, then prints each structured inference step. The recipe fixture is embedded in `test-integration/scripts/chatgpt-recipe-experiment.ts`.
