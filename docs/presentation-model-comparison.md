# Presentation model comparison

The bounded local comparison on 2026-11-08 completed five fixed requests: four passed all strict validators and the voice case failed the required criterion-set check. On the four valid cases, raw-value agreement with retained Claude assessments was 15/32 and applicability agreement 23/32. The local model missed the explicit critical violation in `p1-en-013`. These are presentation observations on a selected sample, not accuracy estimates. The initial import failure and reviewed packaging correction are both retained.

## Frozen inputs and retained comparator

The five cases were selected before execution: two declared English demo cases, then the shortest RU chat, KZ chat and RU voice transcript by transcript-text character count, ties by source ID. This is a small presentation sample, partly selected from known cases. It is not a random sample or a gold-label accuracy benchmark.

Original comparator run: `34f4496c-876a-4e03-9f6e-72c92d89a556`, model `claude-sonnet-5-5`, prompt `cqa-assessment-v1`, checklist `cqa-v1`. The experiment used each run's immutable original result, not mutable reviewed/latest values. Checklist canonical SHA-256 is `2dc9102ae195a0d96e754b7c70972c0f380cea18a23844a555867f36eef3d974`.

| Source ID | Turns / prompt UTF-8 bytes | Claude total | Local total / delta | Historical Claude latency / USD | Local wall time / outcome |
| --- | ---: | ---: | ---: | ---: | --- |
| p1-en-001 | 12 / 7,784 | 92.31 | 100.00 / +7.69 | 5.017 s / 0.013582 | 49.434 s / valid |
| p1-en-013 | 14 / 8,004 | 26.25 | 100.00 / +73.75 | 10.112 s / 0.014742 | 14.857 s / valid |
| p1-ru-025 | 11 / 8,146 | 100.00 | 90.00 / −10.00 | 5.098 s / 0.013118 | 10.628 s / valid |
| p1-kz-014 | 12 / 8,327 | 92.31 | 100.00 / +7.69 | 5.277 s / 0.013608 | 12.280 s / valid |
| p4-ru-002 | 73 / 20,242 | 61.00 | Unavailable: invalid full assessment | 7.327 s / 0.024610 | 23.849 s / missing consultation and empathy |

These five historical successful assessments cost USD 0.079660 in total. Their reuse added no API spend. They ran in an earlier concurrent bulk evaluation, so their latency cannot establish a controlled speed advantage over serial cold local requests. Agreement with Claude would measure agreement, not correctness. No audio processing was involved.

## Local execution and accounting

The harness is [scripts/local_model_comparison.py](../scripts/local_model_comparison.py). It opens canonical SQLite with `mode=ro`, `query_only=ON` and a read transaction; it never creates an application, billing ledger or product evaluation. It freezes exact original source/evaluation/attempt/checklist/prompt/schema hashes. Reconstructed full prompts preserve original turn order, speakers and timestamp strings, and never expose Claude judgments to the local model.

Configured path: cached Qwen2.5-1.5B-Instruct snapshot `989aa7980e4cf806f80c7fef2b1adb7bc71aa306`, normal Ollama Safetensors import, isolated project model store, loopback `127.0.0.1:11435`, `OLLAMA_NO_CLOUD=1`, concurrency one. No pull, installation, global service/config change, account login or HOME override occurred. Ollama's ordinary local identity setup was permitted; identity contents are not artifacts for delivery.

The shared project `runtime/model-jobs.lock` serialized setup, inference and cleanup; staging also used the lock. Application jobs/reservations were checked quiescent and the known app owner was stopped across the corrected run. The original Safetensors snapshot uses relative symlinks. Initial normal import failed before inference with `Error: insecure path: ../../../blobs/46/46ea4ba5786759efecf127c64dee654df39a3f02fdeaafc67734a06574619467`. Initial lifecycle was 9.858 s, failed import 0.032 s. No security setting was disabled.

The reviewed packaging correction copied exactly seven resolved cached model/config/tokenizer files into an ignored project directory as regular files, verifying every source/copy hash. Staging took 11.331 s. Original cache files were preserved. Source Safetensors SHA-256 is `dd924a11b4c220f385b51ffa522daea7c9f3d850e31b162bb5661df483c6d3ee`. Corrected import took 89.809 s; setup including hashing/startup/import took 98.615 s. Corrected lifecycle was 209.721 s, within its fixed 840-second bound. Initial attempt + staging + corrected lifecycle totaled 230.910 s, within the cumulative 15-minute active-job budget. Five primary generations were sent once each, serially, with no repair prompt, output retry, alternate subset or quantization switch.

Imported metadata: Qwen2, 1.5B, GGUF F16, model digest `b69168ee7cf6ce2cd468ff2000c7992b74937b7b37c12737497d57874898b368`, artifact size 3,094,275,765 bytes. Server logs observed all 29/29 layers offloaded to GPU. Sampled processor metadata reported context 16,384 and `size_vram` 3,577,804,225 bytes. There were 183 system resource samples during corrected setup/inference/cleanup: whole-GPU used memory 2–3,572 MiB, free memory 2,286–5,855 MiB, host `MemAvailable` 2,824,020–8,231,924 KiB. These are sampled system/processor observations, not allocator peaks or fully process-attributed host memory. Local API fee was zero; hardware/electricity/total operating cost is unmeasured.

Canonical source, evaluation, run, report, checklist and usage collection hashes plus tracked DEV export bytes matched before/after the corrected local phase. Its billing remained 73 attempts / USD 1.061508 / reserved zero. A later explicitly approved coordinator demo confirmation and report refresh are separate app writes, not local comparison output. No local result entered product evaluations, report metrics or submission JSON. Owned Ollama servers 809131 (initial) and 832887 (corrected) exited with code 0; both samplers stopped, and port 11435 was confirmed closed before app restart.

Ignored evidence: `runtime/local-comparison/task7-20261108/` retains the initial manifest/logs; `task7-staging-manifest.json` records all seven file hashes; `task7-corrected/` retains frozen manifest, exact requests/raw responses, resource samples, model metadata and `aggregate-summary.json`. Raw transcripts, model responses, logs and model artifacts remain ignored.

## Agreement, validity and source checks

All five requests ended with `done=true`, `done_reason=stop`; strict JSON, original JSON schema and Pydantic shape passed 5/5. Shared full-checklist/value/evidence scoring passed **4/5**. The voice response returned only contact, discovery, identification, dialogue, closure and critical; it omitted consultation/empathy. No partial total or criterion agreement is computed for that failed case. The five-case denominator stays visible.

Across the four valid cases (32 eligible pairs), raw-value agreement was **15/32 (46.88%)**, applicability **23/32 (71.88%)**, and critical **3/4**. Numeric scale equivalents such as 15 and 15.0 agree; booleans are distinct from numbers, and null is distinct from false/zero. All scored evidence sets were nonempty and in range. Twenty-one of 32 pairs shared at least one cited turn; overlap does not establish support. Every raw-value disagreement is listed below; omitted criteria agree.

| Source | Raw disagreements: Claude → local |
| --- | --- |
| p1-en-001 | closure false→true; discovery N/A→true; identification N/A→true |
| p1-en-013 | closure false→true; consultation 5→20; critical true→false; dialogue 4→10; discovery false→true; empathy false→true; identification N/A→true |
| p1-ru-025 | closure N/A→true; consultation N/A→10; discovery N/A→true; identification N/A→true |
| p1-kz-014 | closure false→true; discovery N/A→true; identification N/A→true |

Targeted source review inspected all disputed local rationales for the four valid cases, with selected original turns. In `p1-en-001`, local identification cites client turn 7 as an identity check, although the actual operator gives general login guidance at turn 10; turns 10–12 do not establish the identity-check claim. In `p1-en-013`, local critical=false cites only turns 1–7, while the explicit outside paid-advice offer is operator turn 12; the cited region excludes operator turns 10–14. Its identification/consultation/closure rationales also rely on the early client/bot region. This supports a concrete evidence-grounding failure in this selected case.

In `p1-ru-025`, turns 4–9 are client/bot/system, turn 10 is the operator greeting/question, and turn 11 records the client leaving; local identity verification and completed-guidance claims are unsupported by those turns. In `p1-kz-014`, operator turn 10 provides general form-language guidance and turn 12 is farewell; the local rationale's claim that the operator asked the client's name is not supported by the inspected source. Closure/discovery applicability can involve rubric interpretation and is not declared independently regraded here. This was a targeted review of disagreements, not a blinded gold-label study or certification of every Claude judgment.

| Source | Local prompt / output tokens | Server load / prompt / generation seconds |
| --- | ---: | ---: |
| p1-en-001 | 2,067 / 555 | 29.712 / 7.914 / 11.512 |
| p1-en-013 | 2,145 / 566 | 6.774 / 0.619 / 7.213 |
| p1-ru-025 | 2,108 / 513 | 3.242 / 0.579 / 6.563 |
| p1-kz-014 | 2,356 / 705 | 2.370 / 0.662 / 9.020 |
| p4-ru-002 | 6,892 / 1,459 | 2.373 / 1.911 / 19.335 |

Ollama reports nanoseconds; the table divides by 1,000,000,000. Every primary request used `keep_alive=0`, so model unload/cold loading was requested between cases; OS/driver caches and first-load setup were not controlled. Historical concurrent Claude latencies and serial local cold measurements remain descriptive, not a controlled speed comparison.

## Validator contract and fallback

The executed fixed configuration permitted at most five serial primary requests, 90 seconds each, within 15 minutes total, with 16,384 context, 4,096 output tokens, batch 128, seed 2026, temperature 0, six CPU threads, no truncation/context shifting, two ChatML stops and cold unload after each request. It used the original `Assessment` JSON schema, strict duplicate-key/nonfinite rejection, Pydantic validation and shared deterministic scoring. All validation stages, applicability, raw-value agreement, critical agreement, full-score deltas and evidence sets were recorded; the invalid case stays in the five-case denominator. Targeted source checks above are distinct from structural validation and do not constitute independent certified grading.

No further run is part of this experiment. The mandatory presentation uses retained Claude assessments, real source evidence and deterministic scoring, with this bounded local comparison as a measured caution about structure versus evidence support. No product comparison feature exists.
