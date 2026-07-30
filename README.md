# Replication

Replication is a macOS desktop app that turns one short source video into three
Seedance identity-replacement variants:

1. golden three-second opening;
2. impact-chain opening;
3. abnormal-turn opening.

The source story, scene, camera logic, and central meaning stay locked. A
replacement person image and voice reference are required at runtime.

## Portable runtime

The repository includes the Python runtime used to:

- inspect input media;
- prepare three deterministic Seedance request contracts;
- upload references and submit authorized Kuaizi / Seedance jobs;
- resume saved provider task IDs;
- download and validate the final MP4 files.

No `/Users/...` developer path is required. No API key, account, password,
cookie, token, signed URL, or private credential file is included in the
repository.

## Requirements

- macOS on Apple silicon for the provided packaging command;
- Node.js 22.12 or newer and npm;
- Python 3;
- FFmpeg (`ffmpeg` and `ffprobe`);
- the private Python environment created from `requirements.txt`;
- a Kuaizi account with Seedance access for paid generation;
- optional Henghe Cat / MeowLoad CLI for importing a copied video link.

Local file import does not require MeowLoad.

## Install

```bash
git clone https://github.com/francoeur003/replication.git
cd replication
npm install
npm run setup:python
brew install ffmpeg
npm run doctor
npm start
```

If FFmpeg is already installed, skip `brew install ffmpeg`.
`npm run setup:python` creates a repository-local `.venv` and Replication
detects it automatically; nothing is installed into the system Python.

## Configure private credentials

Credentials stay on each user's own computer. The easiest setup is:

```bash
npm run configure
```

The command creates:

```text
~/.config/replication/credentials.json
```

with file mode `0600`. It refuses to overwrite an existing file and never
prints entered secrets.

The supported fields are shown with empty values in
`config/credentials.example.json`. Users can supply either:

- `username` and `password`; or
- `console_token` and `api_key`.

Environment variables are also supported:

```bash
export KUAIZI_USERNAME="..."
export KUAIZI_PASSWORD="..."
```

or:

```bash
export KUAIZI_CONSOLE_TOKEN="..."
export KUAIZI_API_KEY="..."
```

Set `REPLICATION_CREDENTIALS_FILE` only when using a different private
credential-file location. Never put real values in this repository.

## Optional link import

Copied-link import uses MeowLoad. After installing and logging in to MeowLoad,
Replication searches the normal Homebrew locations. A custom executable can be
provided with:

```bash
export REPLICATION_MEOWLOAD="/absolute/path/to/MeowLoad"
```

Without MeowLoad, drag or select a local MP4/MOV/M4V file.

## Run and test

```bash
npm run doctor
npm test
npm start
```

The local integration test prepares three dry-run contracts and does not submit
paid jobs:

```bash
npm run test:integration -- \
  "/absolute/path/to/vertical-video.mp4" \
  "/absolute/path/to/person.png" \
  "/absolute/path/to/voice.mp3"
```

## Build for macOS

```bash
npm run build:mac
```

The packaged app includes `runtime/seedance-face-swap`; the recipient does not
need the developer's Codex Skill directory. Python, the `requests` package,
FFmpeg, and private Kuaizi credentials remain machine-level prerequisites. For
a standalone `.app`, set `REPLICATION_PYTHON` to a Python executable that has
`requests` installed; source installs use `.venv/bin/python` automatically.

## Paid generation boundary

Preparing contracts is local and free. Submitting a run creates exactly three
external Seedance jobs and can incur charges.

The app remains in `waiting_authorization` until the user explicitly confirms
that exact run. Success is reported only after a real MP4 is downloaded and
passes media validation. Closing the app never resubmits automatically.

## Troubleshooting

Run:

```bash
npm run doctor
```

`FAIL` marks a required local dependency. `WARN` marks an optional or
generation-only dependency:

- missing Kuaizi credentials: run `npm run configure`;
- missing Python `requests`: run `npm run setup:python`;
- missing FFmpeg: run `brew install ffmpeg`;
- missing MeowLoad: use local video import or install/login to MeowLoad.
