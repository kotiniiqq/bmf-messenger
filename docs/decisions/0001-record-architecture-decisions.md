# 1. Record architecture decisions

## Context
The project has many moving parts (mail, calls, E2E, marketplace) and more than one contributor,
including AI sessions that start without prior context. Decisions made in chat are lost.

## Decision
Every deviation from `BMF-SPEC.md`, and every non-obvious architectural choice, gets a short ADR
in this folder: context, decision, consequences. Three paragraphs are enough.

## Consequences
A new contributor (human or AI) can reconstruct *why* the code looks the way it does without
asking. ADRs are append-only: superseded ones are marked, not deleted.
