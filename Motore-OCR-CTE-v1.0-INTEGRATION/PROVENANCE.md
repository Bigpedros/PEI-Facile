# Provenance — Motore OCR-CTE v0.9

v0.9 descends from the updated PEI FACILE AI Studio workspace containing the CTE-FIX-03A through 03F line, then from standalone extraction checkpoints v0.2–v0.8.

The Comune di Roma Infanzia reconstructed 12-page PDF is retained solely as a real regression fixture. Its domain does not define the engine architecture or public API.

v0.9 introduces no document-specific detector tuning. It freezes the public engine boundary around the already validated v0.8 pipeline and separates engine version, integration contract version and diagnostic schema version.


## v1.0 Stable Core
Release-freeze derived from v0.9. No intentional field-detection retuning. Public API/diagnostic versions promoted from RC1 to 1.0.0; package surface cleaned; integration and acceptance documents added.
