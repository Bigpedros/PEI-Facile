# Real-document checkpoint — v1.0 Stable Core

## Purpose

v1.0 is a Stable Core release-freeze checkpoint, not a detector retuning checkpoint. The v0.8 12-page Comune di Roma fixture is retained unchanged as the real-world regression baseline.

## Guardrails verified

The v0.8 regression smoke passes across all 12 pages. In particular:
- page 1: 22 authoritative fields, 5 checkbox fields;
- page 10: 24 authoritative fields;
- page 11: 12 authoritative fields, 5 checkbox fields;
- page 12: 26 authoritative fields.

The Stable Core contract smoke additionally verifies that authoritative fields:
- keep correct page ownership;
- have positive extents;
- remain inside canonical page bounds;
- expose required `anchorText`, `confidence`, and `status` contract properties.

## Interpretation

The field detector output baseline is intentionally unchanged by v1.0 release freeze. Any future algorithm change that alters these real-fixture guardrails must be an explicit v1.x detector change with visual review, not an accidental API refactor regression.
