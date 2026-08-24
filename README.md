# @ohcn/care

A CLI to bootstrap and manage a full local [CARE](https://github.com/ohcnetwork/care) development environment in a single command.

```bash
npx @ohcn/care create
```

## What `create` does

1. Prompts for a target directory and runtime (Docker Compose or native).
2. Lets you pick backend and frontend plugs from a bundled registry ([`src/plugs.json`](src/plugs.json)).
3. Prompts only for the environment variables each selected plug marks as `prompt`; everything else uses its `default`.
4. Asks whether to populate the database with dummy data.
5. Clones `care` and `care_fe` (plus the selected plug repos) at the branches defined in the registry.
6. Configures backend plugs via `ADDITIONAL_PLUGS` (their env lands in each plug's `configs`), and writes `care_fe/.env.local`.
7. Builds and starts the services, makes backend plugs editable, runs migrations, syncs permissions/valuesets, optionally loads fixtures, and registers frontend plugin configs.
8. Writes a `.care-create.json` manifest so `care start` knows the layout.

## What `care run` does

Run from the target directory (or pass it as an argument) to launch every dev server (`start` is an alias):

```bash
care run              # or: care run ./care-platform
```

- Brings up the backend (docker `up -d`, or `runserver` for native).
- Starts the `care_fe` dev server (http://localhost:4000).
- Starts each selected frontend plug's dev server (e.g. http://localhost:5173).
- Installs npm dependencies for any target missing `node_modules`.
- Each server's dev command comes from `devCommand` in the registry/manifest (defaults to `npm run dev`), and output is streamed with a colored `[name]` prefix.

Press `Ctrl+C` to stop the dev servers.


## Requirements

- Node.js >= 18
- Git
- Docker + Docker Compose (for the Docker runtime), or pipenv + local Postgres/Redis (for native)

## Options

| Flag | Description |
| --- | --- |
| `--branch <branch>` | Override the branch used for the core `care` and `care_fe` repos. |
| `--skip-install` | Clone and configure only; skip building and starting services. |

## The plugs registry

Every plug — backend or frontend — is described in [`src/plugs.json`](src/plugs.json) with its repo, branch, and env schema. Each env entry supports:

- `default` — value used when not prompted.
- `prompt` — ask the user for this value during setup.
- `secret` — mask the input.
- `description` — shown in the prompt.

To add a plug, add an entry under `backend` or `frontend`.

## Development

Written in TypeScript, bundled with tsup.

```bash
npm install
npm run dev -- create --help   # run from source with tsx
npm run typecheck              # tsc --noEmit
npm run build                  # emit dist/cli.js
node dist/cli.js create        # run the built CLI

# try it as the `care` binary
npm link
care create --skip-install
```

## Future commands

The CLI is a multi-command tool (`care <command>`), so additional commands such as `care run` can be added alongside `create`.
