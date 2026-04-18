---
title: Introduction
description: A swim-lane editor for AI orchestration.
group: Getting Started
order: 1
---

Tagma is a swim-lane editor for AI orchestration. You compose pipelines of **tasks** — prompts or commands — and they run on the agent CLIs you already have installed locally.

## What is a task?

A task is the atomic unit in Tagma. Every task has a `driver` (which CLI runs it), a `prompt` or `command`, and an optional set of `signals` it emits or waits on. Tasks are arranged into **lanes**, which run in parallel.

```yaml
# .tagma/test-pipeline.yaml
lanes:
  - name: Backend
    driver: opencode
    tasks:
      - id: plan
        prompt: "Plan the /health endpoint change."
      - id: implement
        prompt: "Implement /health."
        after: [plan]
```

> **Local-first.** Everything runs on your machine. Tagma never proxies prompts — it invokes the CLIs you already trust.

## Install

Download the signed build for your platform, or install via Homebrew:

```sh
brew install tagma/tap/tagma
```

### System requirements

| Platform | Minimum     | Recommended   |
| -------- | ----------- | ------------- |
| macOS    | 13 Ventura  | 14+ Sonoma    |
| Windows  | 10 (22H2)   | 11            |
| Linux    | glibc 2.31+ | Ubuntu 22.04+ |

## Next

- Build [your first pipeline](/docs/first-pipeline) in five minutes.
- Browse the [driver reference](/docs/drivers).
- Write a plugin with the [TypeScript SDK](/docs/sdk).
