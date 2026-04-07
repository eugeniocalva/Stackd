# Vibe Coding Workflow
## How Product Analyst → Architect → Vibe Engineer → QA Tester work together

---

## Overview

This document defines the standard workflow for shipping features using AI-assisted roles. Each role has a clear input, output, and handoff. No role should start until the previous one has delivered its artifact.

```
Product Analyst → Architect → Vibe Engineer → QA Tester → Ship
```

---

## The Roles

| Role | Responsibility | Key Output |
|---|---|---|
| **Product Analyst** | Define *what* to build and *why* | PRD (Product Requirements Doc) |
| **Architect** | Define *how* to build it | Architecture Doc |
| **Vibe Engineer** | Build it | Working code |
| **QA Tester** | Verify it works correctly | QA Report + sign-off |

---

## Step-by-Step Workflow

### Step 1 — Product Analyst: Define the Problem

**Trigger:** A new feature idea, bug fix, or product initiative.

**Tasks:**
1. Write a one-sentence problem statement
2. Identify the target user and their goal
3. Write 3–5 user stories (`As a [user], I want [goal] so that [benefit]`)
4. Define acceptance criteria for each story
5. Apply MoSCoW prioritisation (Must / Should / Could / Won't)
6. List open questions and risks
7. Define success metrics

**Output:** Completed PRD saved to the project

**Handoff to Architect:** Share the PRD and flag any technical constraints or unknowns that need design decisions.

---

### Step 2 — Architect: Design the Solution

**Trigger:** PRD is approved and complete.

**Tasks:**
1. Read the PRD in full — ask the Product Analyst to clarify any ambiguities before proceeding
2. Define the tech stack and justify choices
3. Design the high-level system structure (components, data flow, APIs)
4. Identify third-party services or dependencies
5. Define folder/module structure
6. Flag any PRD requirements that are technically risky or need scoping down
7. Estimate rough complexity (small / medium / large)

**Output:** Architecture Doc saved to the project

**Handoff to Vibe Engineer:** Share both the PRD and Architecture Doc. Walk through the architecture if the feature is complex.

---

### Step 3 — Vibe Engineer: Build the Feature

**Trigger:** PRD and Architecture Doc are both complete and approved.

**Tasks:**
1. Read the PRD and Architecture Doc before writing any code
2. Raise blockers or missing info *before* starting — not mid-build
3. Build the feature in vertical slices (smallest working unit first)
4. Write clean, readable code with comments only where logic is non-obvious
5. Handle edge cases and error states as defined in the acceptance criteria
6. After each slice, summarise: what was built, assumptions made, what's next
7. Self-review against the acceptance criteria before handing off

**Output:** Working feature branch / code ready for review

**Handoff to QA Tester:** Share the feature branch, the PRD, and a short summary of what was built and any known limitations.

---

### Step 4 — QA Tester: Verify and Sign Off

**Trigger:** Engineer marks the feature as ready for QA.

**Tasks:**
1. Read the PRD acceptance criteria — this is the source of truth for testing
2. Write and run test cases covering:
   - ✅ Happy paths (expected flows)
   - ⚠️ Edge cases (boundary conditions, empty states, large inputs)
   - ❌ Failure scenarios (network errors, invalid data, missing permissions)
3. Check non-functional requirements: performance, accessibility, mobile responsiveness
4. Log every bug with: steps to reproduce, expected result, actual result, severity
5. Re-test all fixed bugs before closing them
6. Issue a final verdict:
   - 🔴 **Not shippable** — critical bugs present
   - 🟡 **Ship with caution** — known issues, documented and accepted
   - 🟢 **Good to go** — all acceptance criteria met

**Output:** QA Report with verdict

**Handoff:** If 🟢, feature is cleared for release. If 🔴 or 🟡, bugs are sent back to the Vibe Engineer with clear reproduction steps.

---

## Handoff Rules

These rules apply to every handoff between roles:

1. **Never skip a step.** The Engineer does not start without an Architecture Doc. The QA Tester does not start without a feature summary from the Engineer.
2. **The PRD is the contract.** If acceptance criteria are unclear, go back to the Product Analyst — don't interpret or assume.
3. **Flag blockers early.** Raise issues at the start of your step, not at the end.
4. **Artifacts travel with the work.** The PRD and Architecture Doc are attached at every handoff so every role has full context.
5. **Bugs go back with evidence.** QA sends bugs to Engineering with steps to reproduce, not just a description.

---

## Workflow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     FEATURE REQUEST                         │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  PRODUCT ANALYST                                            │
│  → Problem statement, user stories, acceptance criteria     │
│  Output: PRD                                                │
└──────────────────────────┬──────────────────────────────────┘
                           │  PRD approved
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  ARCHITECT                                                  │
│  → Tech stack, system design, module structure              │
│  Output: Architecture Doc                                   │
└──────────────────────────┬──────────────────────────────────┘
                           │  Architecture approved
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  VIBE ENGINEER                                              │
│  → Build feature in vertical slices                         │
│  Output: Working code                                       │
└──────────────────────────┬──────────────────────────────────┘
                           │  Feature ready for QA
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  QA TESTER                                                  │
│  → Test happy paths, edge cases, failure scenarios          │
│  Output: QA Report + verdict                                │
└──────────────┬───────────────────────────┬──────────────────┘
               │ 🟢 Good to go             │ 🔴 Bugs found
               ▼                           ▼
          [ SHIP IT ]              [ Back to Engineer ]
```

---

## Tips for Using AI Roles

- **Attach the PRD to every Claude conversation.** Every role needs the full context.
- **One role per conversation.** Start a fresh chat when switching roles to avoid context drift.
- **Use the Role Prompt Library** to set the right persona at the start of each chat.
- **Be explicit about the handoff.** Tell Claude exactly which step you're on and what the previous role produced.

---

*Last updated: 2026-03-24 | Vibe Coding Toolkit*
