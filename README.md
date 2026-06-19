# DialogLingo

<p align="center">
  <img src="imgs/cover/cover1.png" alt="DialogLingo Cover" width="100%">
</p>

[中文版](README_CN.md) | English

DialogLingo turns local AI-agent chat history into reviewable English learning workbooks and Anki-ready decks.

If English is currently the smoothest way to work with AI agents, your everyday conversations with tools like Codex, Claude Code, and OpenCode already contain useful learning material. DialogLingo pulls those local conversations into a desktop app, lets you select the sessions that matter, generates `Expression` and `Sentence` study items, and exports the result to Anki or text bundles.

## Why This Exists

Most language-learning apps give you generic examples. DialogLingo starts from the conversations you already have while building, debugging, and asking agents for help. The goal is not to become another spaced-repetition system. The goal is a focused local pipeline:

```text
local sessions -> selection -> generation -> review workbook -> export
```

You review and clean the generated workbook in DialogLingo, then study it in Anki or another downstream tool.

## Screenshots

### Search and Select

![Search and Select](imgs/search_select.png)

### Workbook Review

![Workbook](imgs/workbook.png)

### Editable Generation Prompt

![Generate Prompt](imgs/generate_prompt.png)

### Export Options

![Export Options](imgs/export.png)

## Features

- **Local session discovery**: indexes local Codex, Claude Code, and OpenCode histories from their default paths.
- **Search and selection workflow**: filter by time range, platform, project, title, or transcript content before generating.
- **Workbook generation**: creates two study item types, `Expression` and `Sentence`, from mixed-language AI conversations.
- **Editable prompt preview**: shows the generated model prompt before a run, so you can adjust the extraction request.
- **Noise-aware pipeline**: pre-cleans tool output, logs, code blocks, path fragments, and obvious secret-like strings before model calls.
- **Review-first workbook**: edit, delete, restore, revert, and inspect source provenance before exporting.
- **Anki-first export**: exports `.apkg`, Anki text bundles, and generic text bundles with deck name, direction, tag, and item-type options.
- **Narrow model surface**: supports an OpenAI-compatible API endpoint plus explicit local CLI backends for Codex, Claude, and OpenCode.
- **Local-first privacy posture**: indexing stays local; remote generation requires explicit provider configuration.
- **English and Simplified Chinese UI**: the app includes both English and Chinese interface text.

## Related Projects

Research snapshot: 2026-06-19. I did not find another open-source project with the same full workflow as DialogLingo: local AI-agent session discovery, search and selection, noise-aware extraction, workbook review with source provenance, and Anki-first export. The closest overlap is [voidash/chatGPT-to-Anki](https://github.com/voidash/chatGPT-to-Anki).

| Project | Main workflow | Overlap with DialogLingo | Choose it when | Choose DialogLingo when |
| --- | --- | --- | --- | --- |
| [voidash/chatGPT-to-Anki](https://github.com/voidash/chatGPT-to-Anki) | Browser extension plus Anki add-on for turning ChatGPT, Claude.ai, Perplexity.ai chats, and highlighted web text into Anki cards without API keys. | High: AI conversations -> reviewed flashcards -> Anki-oriented export/import. | You mostly work inside web chat products and want quick capture into Anki Desktop. | You want to mine local Codex, Claude Code, or OpenCode history by project/time/search, preserve provenance, and review a workbook before export. |
| [nilsreichardt/AnkiGPT](https://github.com/nilsreichardt/AnkiGPT) | Web app / GPT flow for generating flashcards from PDF slides or pasted text, editing them, and exporting CSV to Anki. | Medium: AI-generated flashcards with a review step and Anki export. | Your source material is lectures, slides, PDFs, or pasted study notes. | Your source material is local agent chat history and the learning target is expressions/sentences from real AI work conversations. |
| [AlexToumayan/Chat-GPT-Flashcards-To-Anki-Converter](https://github.com/AlexToumayan/Chat-GPT-Flashcards-To-Anki-Converter) | Python converter for paste-in ChatGPT-generated `Front` / `Back` cards into an Anki-compatible import format. | Medium-low: ChatGPT output -> Anki import format. | You already prompted ChatGPT manually and only need a lightweight format converter. | You want automatic session ingestion, extraction, deduping, editing, and export from a selected corpus. |
| [taabishm2/copy-to-anki](https://github.com/taabishm2/copy-to-anki) | Browser extension for saving highlighted web-page text to Anki via AnkiConnect, with optional ChatGPT question generation. | Medium: selected text -> AI-assisted Anki card creation. | You are clipping individual web passages while browsing. | You want to process stored multi-session agent conversations in batches. |
| [pictoune/AnkiLingoFlash](https://github.com/pictoune/AnkiLingoFlash) | Browser extension for language-learning cards from web content, including definitions, mnemonics, pronunciation guidance, and AnkiConnect integration. | Medium: language-learning flashcards with AI assistance and Anki integration. | You want vocabulary mining directly from websites across Chrome, Edge, or Firefox. | You want a desktop review console for agent-session-derived English learning material. |
| [raine/anki-llm](https://github.com/raine/anki-llm) | CLI/TUI toolkit for processing existing Anki decks with OpenAI-compatible LLMs, generating cards from terms, retrying/resuming batch jobs, and updating Anki through AnkiConnect. | Medium: LLM-assisted Anki workflows with review and automation. | You already have Anki decks and want to improve, batch-process, or extend them. | You want to create new workbook material from local chat transcripts before it reaches Anki. |
| [thiswillbeyourgithub/AnkiAIUtils](https://github.com/thiswillbeyourgithub/AnkiAIUtils) | AI utilities for enhancing existing Anki cards with explanations, mnemonics, illustrations, and adaptive follow-up. | Low: improves Anki learning with AI, but starts from existing cards. | You want AI help after cards are already in Anki. | You need the upstream pipeline that turns local AI work conversations into reviewable cards. |

Selection guide:

- Use DialogLingo for local agent-history mining: `local sessions -> selection -> generation -> review workbook -> export`.
- Use `chatGPT-to-Anki` for the fastest browser-chat-to-Anki path.
- Use browser clippers such as `copy-to-anki` or `AnkiLingoFlash` for one-off web-page vocabulary/card capture.
- Use `AnkiGPT` for slide/PDF/text study-note generation.
- Use `anki-llm` or `AnkiAIUtils` when your main object is an existing Anki collection rather than source transcript ingestion.

## Installation

Recommended: download the installer for your platform from the GitHub Releases page:

[https://github.com/wufei-png/dialoglingo/releases](https://github.com/wufei-png/dialoglingo/releases)

Use the source workflow only when you want the latest unreleased changes or local development.

Requirements:

- Node.js `24.15.0`
- npm
- Local chat history from at least one supported agent tool

```bash
git clone https://github.com/wufei-png/dialoglingo.git
cd dialoglingo
nvm use
npm install
npm run dev
```

To try the workbook UI without calling a remote API or local CLI model backend:

```bash
npm run dev:mock-llm
```

In the app, open `Settings` to configure either an OpenAI-compatible API endpoint or one of the supported CLI backends.

## Local Packaging

```bash
npm run package:mac
npm run package:win
npm run package:linux
```

Use the platform command that matches your machine. The package scripts build the Electron app and verify packaging inputs before creating local artifacts.

## Development

Common commands:

```bash
npm run dev
npm run dev:mock-llm
npm run typecheck
npm test
npm run build
```

The current product and architecture contract lives in:

- [DialogLingo v1 Design](docs/superpowers/specs/2026-06-15-dialoglingo-v1-design.md)
- [Generation Pre-clean and Candidate Mining](docs/architecture/2026-06-18-generation-preclean-candidate-mining.md)

## Native Module ABI Note

`better-sqlite3` has separate Node and Electron ABI builds in this repo.

- `npm run build` and `npm run dev` run `prepare:native:electron`, which rebuilds the Electron ABI copy used by the Electron main process.
- Vitest and other plain Node commands need the Node ABI copy.
- If a Node test fails with `NODE_MODULE_VERSION` after a build, refresh the Node ABI and snapshot before testing:

```bash
npm run rebuild:native:node
npm run capture:native:node
npm run test -- --run
```

Do not remove the Electron rebuild step. The detailed policy lives in [Electron stack version decision](docs/architecture/2026-06-15-electron-stack-version-decision.md).

## Project Address

[https://github.com/wufei-png/dialoglingo](https://github.com/wufei-png/dialoglingo)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=wufei-png/dialoglingo&type=Date)](https://star-history.com/#wufei-png/dialoglingo&Date)

## License

MIT
