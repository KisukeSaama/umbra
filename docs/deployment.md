# Deployment

Umbra deploys to the kisukesaama homelab, following the platform guide at
`devops/docs`. Two environments:

| Environment | Host                              | Trigger                 |
| ----------- | --------------------------------- | ----------------------- |
| DEV         | `https://umbra-d.kisukesaama.com` | manual job on `develop` |
| PROD        | `https://umbra.kisukesaama.com`   | automatic on tag `v*`   |

No DNS work: the wildcard already resolves, and Traefik picks the router up from
the container labels.

## What is deployed

One image, three containers:

- `web`: the Next.js server. The only one on the `traefik` network. Applies
  migrations at boot and mounts the media root (`/mnt/plex` unless `paths.env`
  says otherwise) read-write, because the storage page both measures it and
  deletes from it (see `docs/adr/0012-files-are-deleted-from-the-storage-page.md`).
  The container still runs as uid 10001 with every capability dropped, so the
  media has to be writable by that user or its group; if it is not, a deletion
  answers read-only and changes nothing, which is a safe failure rather than a
  silent one.
- `worker`: the same image running `scripts/sync-worker.mjs`, calling the sync
  endpoint on a loop. No public surface, and `MIGRATE_ON_START=false`, because
  only the web container owns the schema.
- `postgres`: state under `/home/kisuke/umbra/<env>/postgres`, bind mounted so
  backups can see it.

## Before the first deployment

1. **Register the APIs in Janus** and subscribe Umbra to them: `kisuflix`,
   `tmdb-v3`, `myanimelist-v2` (a MAL client id sent as the `X-MAL-CLIENT-ID`
   header), and `plex.tv` for sign-in. Without the last one, Plex sign-in is
   refused by the gateway with a 404 or 403, which is expected rather than a
   bug. Without MyAnimeList, anime fall back on TMDB's own recommendations. See
   `JANUS.md`.
2. **Set the CI/CD variables**, scoped per environment, production ones
   protected:

   | Variable                      | Required    | Notes                                  |
   | ----------------------------- | ----------- | -------------------------------------- |
   | `UMBRA_POSTGRES_PASSWORD`     | yes         |                                        |
   | `UMBRA_JANUS_APPLICATION_ID`  | yes         | Not a secret, but environment specific |
   | `UMBRA_JANUS_API_KEY`         | yes         | Shown once when issued                 |
   | `UMBRA_CRON_SECRET`           | yes         | At least 16 characters                 |
   | `UMBRA_ADMIN_PLEX_ACCOUNT_ID` | recommended | The account that becomes admin         |
   | `UMBRA_STORAGE_PATHS`         | no          | Defaults to `Media:/mnt/plex`          |
   | `UMBRA_JANUS_URL`             | no          | Overrides the gateway address          |

   There is no approval setting: whoever the server is shared with on plex.tv
   gets in, and nobody else (see `docs/adr/0014-only-members-of-the-server.md`).
   The slugs, the database
   name and user and the sync interval have `UMBRA_*` overrides of their own,
   listed at the top of `.gitlab-ci.yml`, and their defaults are what dev and
   prod both run on.

3. **Check the disk.** The root filesystem on that host runs close to full;
   `docker builder prune -af` before a first build is often what makes it pass.

## Releasing

```bash
git push origin develop      # test and build run, then deploy_dev is manual
git switch main && git merge --ff-only develop && git push
git tag v1.0.0 && git push origin v1.0.0   # deploy_prod runs by itself
```

The tag is the image tag and the rollback handle.

## After a deployment

```bash
docker compose -p umbra-prod ps
curl -sI https://umbra.kisukesaama.com | head -1
```

The first sign-in of `UMBRA_ADMIN_PLEX_ACCOUNT_ID` creates the administrator.
Then run a sync from the admin synchronisation page, or wait for the worker: the
first pass indexes the library, which is what makes search able to answer
"already available".

## Things specific to this platform

- Every job carries `tags: [devops]`, or it waits forever.
- Deployment files are staged onto the host through a container: the runner does
  not mount `/home/kisuke`.
- `traefik.docker.network` is mandatory here because `web` sits on more than one
  network.
- `tls=true` with no certresolver: the Cloudflare origin certificate is already
  mounted in Traefik.
- `expose`, never `ports`.
- The compose project name is `umbra-<env>`, which is what keeps dev and prod
  apart on a shared host.
