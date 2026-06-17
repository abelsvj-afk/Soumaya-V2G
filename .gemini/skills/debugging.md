# 🧪 Skill: Systematic Debugging
*Hypothesis-Driven Root Cause Analysis*

## 1. Observation
- Capture raw error messages, stack traces, and environment state.
- If it's a UI bug, describe the visual desync.

## 2. Hypothesis Formation
- State: "I suspect the cause is [X] because [Y]."
- Avoid "blind fixing" (changing code without knowing why it's broken).

## 3. Minimal Reproduction
- Create the smallest possible script or test case that triggers the bug.
- Prove the bug is deterministic.

## 4. Instrumentation (The "Superpower")
- If the cause is still opaque, add temporary "Trace Logs" or `console.spy` calls.
- Use the `read_file` tool to inspect intermediate state during execution.

## 5. Targeted Fix
- Apply the minimal change needed to satisfy the reproduction test.
- Verify that NO other tests are broken by the fix.

## 6. Post-Mortem
- Could this bug have been prevented by a better Type or a Guardrail?
- Propose a structural improvement to ensure this class of bug never returns.
