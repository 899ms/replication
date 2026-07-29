# Replication

Replication is a deliberately small macOS desktop app:

```text
one source video
→ runtime person + voice replacement
→ three Seedance identity-replacement contracts
→ three generated MP4s
```

The source video can come from a local file or a copied video link. Link import
is handled through Henghe Cat / MeowLoad, downloaded into local storage, and then
validated with the same source-video contract.

The app requires a runtime replacement person image and voice reference, then
applies three fixed creative directions:

1. golden three-second opening;
2. impact-chain opening;
3. abnormal-turn opening.

Each direction also receives a distinct ending treatment. The source story,
scene, camera logic, and central meaning remain locked.

## Run locally

```bash
npm install
npm start
```

## Tests

```bash
npm test
npm run test:integration -- "/absolute/path/to/a/vertical-video.mp4"
```

The integration test performs a real local preflight and creates three
Seedance dry-run contracts. It does not submit paid jobs.

## Real generation boundary

The desktop action is bound to the canonical `seedance-face-swap` execution
workflow through `video.replication.generate.v1`. Preparing contracts is local
and free. Submitting three Seedance jobs is a paid external action and therefore
requires an explicit confirmation inside the app for that exact run.

The app never reports success from a timer or template response. Success
requires a real MP4 artifact that can be probed.

The current Demo persists run contracts, logs, task IDs, and artifacts. It can
restore finished history after restart, but it does not yet reconnect to an
in-flight remote task. Closing the app during generation stops local tracking;
it never resubmits or charges again automatically.
