# v1124 WorkStation Runner

Local browser runner for the v1124 WorkStation.

## Core endpoints

- `GET /health`
- `POST /browser/open`
- `POST /browser/close`
- `GET /browser/current?browser=chrome`
- `POST /checker/ultimate`
- `GET /checker/status?job=<id>`
- `GET /checker/report/<id>`
- `POST /extractor/run`
- `GET /extractor/status?job=<id>`
- `POST /extractor/merge`
- `GET /sources`
- `POST /sources/upload`
- `GET /instructions/platform`

## Extractor behavior

The uTest Academy extractor runs inside the authenticated Playwright page context and returns individual raw JSON documents. The old ZIP packaging step is intentionally bypassed for WorkStation use. `POST /extractor/merge` merges those JSON documents into one Master JSON and streams progress through the extractor job messages.

The authoritative stored project instruction is bundled as `1. Project Instructions.txt` and exposed through `/instructions/platform`.
