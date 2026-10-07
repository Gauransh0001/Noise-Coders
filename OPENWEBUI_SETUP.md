# IT API through Open WebUI + Llama - setup

What was added (nothing existing was removed or rewritten):

| File | Change |
|---|---|
| `server/openWebUiApi.js` | NEW - calls Open WebUI (Llama 3 first, then Llama) |
| `server/testOpenWebUI.js` | NEW - quick test script |
| `server/domainApis.js` | +1 import line, +5 lines in `callDomainApi()` (marked `NEW`) |
| `server/index.js` | +1 import line, +1 route `GET /api/openwebui` (marked `NEW`) |
| `.env` | 3 new settings appended at the bottom; everything else unchanged |

How it works for an IT question:
1. Open WebUI with Llama 3 (answers from the matching fact in `data/domains/it.json`, so the source is still shown).
2. If that model fails, the next model in `OPENWEBUI_MODELS` (Llama).
3. If Open WebUI is not set or fails, the `IT_BOT_URL` bot (if set), then the original built-in answer.

## Steps

1. Install Ollama and download the models (names must match what you list in `.env`):
   ```
   ollama pull llama3
   ollama pull llama2
   ollama list
   ```
2. Run Open WebUI, for example with Docker:
   ```
   docker run -d -p 3000:8080 -v open-webui:/app/backend/data --name open-webui ghcr.io/open-webui/open-webui:main
   ```
   Open http://localhost:3000, create your account, and make sure Open WebUI is connected to
   Ollama (Admin Settings > Connections) so your Llama models appear in its model list.
   Do not run Open WebUI on port 8080 - this app uses 8080.
3. Create an API key in Open WebUI: Settings > Account > API Keys > Generate New API Key.
4. Fill in `.env` (the lines are at the bottom):
   ```
   OPENWEBUI_URL=http://localhost:3000
   OPENWEBUI_API_KEY=sk-your-key
   OPENWEBUI_MODELS=llama3,llama2
   ```
5. Test it: `node server/testOpenWebUI.js "My wifi is not connecting"`
   It shows whether Open WebUI is reachable and the exact model names it has ("available").
   If your names differ (for example `llama3.1:8b`), copy them into `OPENWEBUI_MODELS`.
6. Start the app: `node server/index.js`, open http://localhost:8080 and ask an IT question.
   You can also check http://localhost:8080/api/openwebui at any time (never shows your URL or key).

## Notes
- A Llama model on a CPU can be slow; the wait limit is 60 seconds (`TIMEOUT_MS` in `server/openWebUiApi.js`).
- A line starting `[open-webui]` in the terminal means that model failed and the next option was used.
- To undo: delete `server/openWebUiApi.js`, `server/testOpenWebUI.js` and the lines marked `NEW` that mention Open WebUI.
