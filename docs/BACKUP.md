# Backups and notifications

## Nightly backup

`.github/workflows/backup.yml` runs every night (and on demand: Actions → backup → Run workflow).
It saves the whole database (notes, rooms, folders, history, accounts) and every photo into one
file, encrypts it with your password, and keeps it for 90 days on the run's page.

### One-time setup (GitHub → repository → Settings → Secrets and variables → Actions → New repository secret)

| Name | Value |
| --- | --- |
| `SUPABASE_DB_URL` | Supabase → Project → **Connect** → *Session pooler* connection string, with your database password filled in |
| `BACKUP_PASSWORD` | Any long password you choose. **Write it down** – without it the backup cannot be opened. |

Use the *Session pooler* string (host `…pooler.supabase.com`): GitHub's machines cannot reach the direct one.

### Opening a backup

Download the file from the run's page, unzip the GitHub zip, then:

```sh
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in kovan-backup-DATE.tar.gz.enc | tar -xzf -
```

You get `database.dump`, `users.dump` and `images/`. To restore into a Supabase project:

```sh
pg_restore --data-only -d "$DB" users.dump        # accounts first
pg_restore --no-owner --no-privileges -d "$DB" database.dump
```

## Notifications

`supabase/push.sql` + `api/push.js`. Nothing to set up: the app makes its own notification key
the first time someone turns them on, and keeps it in the database (table `push_keys`).
Each person turns them on per device with the bell next to their name.
On iPhone, add Kovan to the home screen first.
