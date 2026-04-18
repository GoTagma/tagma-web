---
title: Your First Pipeline
description: Compose a two-lane pipeline and run it end-to-end in five minutes.
group: Getting Started
order: 2
---

This guide builds the smallest non-trivial pipeline in Tagma: two lanes, three tasks, one signal.

## Create the file

Tagma reads pipelines from `.tagma/*.yaml` in your project root. Create `.tagma/hello.yaml`:

```yaml
lanes:
  - name: Plan
    driver: opencode
    tasks:
      - id: outline
        prompt: "Outline a CLI that greets the user."
  - name: Build
    driver: claude-code
    tasks:
      - id: scaffold
        prompt: "Scaffold the project."
        after: [outline]
      - id: implement
        prompt: "Implement greet()."
        after: [scaffold]
```

## Run it

Open Tagma and pick the file. Each lane shows its tasks in a swim-lane; arrows mark `after` dependencies.

> **Tip.** Hold `⇧` and click a task to run only that task plus its descendants.

## Next

- See the full [driver reference](/docs/drivers).
- Learn about [signals](/docs/signals) for cross-lane coordination.
