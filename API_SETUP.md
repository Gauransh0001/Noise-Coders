# Domain APIs (FinGPT for Finance) - setup

What was added (nothing existing was removed or rewritten):

| File | Change |
|---|---|
| `server/domainApis.js` | NEW - calls the external APIs |
| `server/testApis.js` | NEW - quick test script |
| `server/bots.js` | +1 import line, +3 lines at the top of `answerQuestion()` (marked `NEW`) |
| `server/index.js` | +1 import line, +1 route `GET /api/domain-apis` (marked `NEW`) |
| `.env` | new variables appended at the bottom; your existing keys are unchanged |

How it works: for each question, the server first tries the domain's external API.
If that API is not set in `.env`, is down, or fails, the original code runs exactly as before.

| Domain | API used | Setting in `.env` |
|---|---|---|
| Fees & Finance (`fees`) | **FinGPT** | `FINGPT_API_URL`, `FINGPT_MODEL`, `FINGPT_API_KEY` (optional) |
| IT / HR / Facilities | any chatbot API | `IT_BOT_URL`, `HR_BOT_URL`, `FACILITIES_BOT_URL` (+ optional `*_BOT_KEY`) |

## Steps

1. Unzip, open the folder in VS Code. You need Node 18+.
2. Get FinGPT running as an OpenAI-style server. FinGPT has no official hosted API; it is
   open-source model weights, so you host it yourself. Common options:
   - **Ollama / llama.cpp / vLLM** on your own machine or server (a merged or quantised
     FinGPT model works best; the full model needs a big GPU).
   - **A Hugging Face Inference Endpoint** that you deploy with the FinGPT model.
   Either way you end up with a URL ending in `/v1/chat/completions`.
3. Open `.env` and fill in the new lines at the bottom, for example:
   ```
   FINGPT_API_URL=http://localhost:11434/v1/chat/completions
   FINGPT_MODEL=fingpt
   ```
   For IT / HR / Facilities bots, set their URLs. Each bot must accept
   `POST {"query": "..."}` and reply `{"answer": "..."}` (optional `"sources": [...]`).
   Leave any line blank to skip that API.
4. Test the connections:
   ```
   node server/testApis.js "When is the semester fee deadline?"
   ```
   It prints which APIs are configured and what each one returned.
5. Start the app: `node server/index.js`, then open http://localhost:8080.
6. Check it any time at http://localhost:8080/api/domain-apis (shows which APIs are set,
   never shows URLs or keys). Watch the terminal: a line starting `[domain-api:...]`
   means that API failed and the built-in answer was used instead.

## Notes
- FinGPT is only given the matching campus fact from `data/domains/fees.json` and told to answer
  from it, so answers still show their source. If no fact matches, the original
  "couldn't find a specific answer" reply is used.
- Timeout per API call is 20 seconds (`TIMEOUT_MS` in `server/domainApis.js`).
- To undo everything, delete `server/domainApis.js` and the lines marked `NEW`.
