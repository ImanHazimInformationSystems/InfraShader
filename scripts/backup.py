"""Back up InfraShader's application database and private Storage files together.

Run from the repository root with the API environment, for example:

    uv run --project apps/api python scripts/backup.py --out D:/infrashader-backups --keep 14

What is captured (see deploy/RUNBOOK.md):
- the application PostgreSQL/PostGIS database (pg_dump custom format). Issued PDFs, review
  files, opportunity packages and attachments are stored in this database;
- the private Storage bucket(s) (default: ``evidence``), downloaded object by object;
- optionally the identity (Supabase Auth) database, when AUTH_DATABASE_URL is set and you
  operate it yourself. Hosted Supabase keeps its own identity backups;
- a manifest with sizes, SHA-256 digests, the migration revision and what was skipped.

Settings come from the environment (DATABASE_URL, SUPABASE_URL, STORAGE_SERVICE_KEY,
AUTH_DATABASE_URL) or from ``--env-file``. Secrets are never written to the backup, the
manifest or the console; the database password is passed to pg_dump through PGPASSWORD.

A backup is written to ``<name>.partial`` and renamed only once every step succeeded, so a
folder without ``.partial`` is complete. ``--keep`` removes only older complete backups whose
folder name this script generated. A backup is not proven until a restore drill passes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlparse

NAME = re.compile(r"^infrashader-\d{8}T\d{6}Z$")
LIST_LIMIT = 1000


def load_env_file(path: Path) -> dict[str, str]:
    """Read simple KEY=VALUE lines; comments and blank lines are ignored."""
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.removeprefix("export ").split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def libpq_environment(database_url: str) -> dict[str, str]:
    """Translate a SQLAlchemy/libpq URL into PG* variables so no secret is on the command line."""
    parsed = urlparse(database_url)
    if parsed.scheme not in {"postgresql", "postgresql+psycopg", "postgres"}:
        raise ValueError("The database URL must be a PostgreSQL URL.")
    database = parsed.path.lstrip("/")
    if not parsed.hostname or not database:
        raise ValueError("The database URL must name a host and a database.")
    env = {"PGHOST": parsed.hostname, "PGDATABASE": unquote(database)}
    if parsed.port:
        env["PGPORT"] = str(parsed.port)
    if parsed.username:
        env["PGUSER"] = unquote(parsed.username)
    if parsed.password:
        env["PGPASSWORD"] = unquote(parsed.password)
    for part in filter(None, parsed.query.split("&")):
        key, _, value = part.partition("=")
        if key == "sslmode":
            env["PGSSLMODE"] = value
    return env


def safe_object_path(name: str) -> PurePosixPath:
    """Reject Storage object names that could escape the backup folder."""
    # Check the raw segments: PurePosixPath would quietly normalise "a//b" and "a/./b".
    if not name or name.startswith("/") or ":" in name or "\\" in name:
        raise ValueError(f"Unsafe Storage object name: {name!r}")
    if any(part in {"", ".", ".."} for part in name.split("/")):
        raise ValueError(f"Unsafe Storage object name: {name!r}")
    return PurePosixPath(name)


def digest(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            sha.update(block)
    return sha.hexdigest()


def find_pg_dump(explicit: str | None) -> str:
    if explicit:
        return explicit
    found = shutil.which("pg_dump")
    if found:
        return found
    local = Path(__file__).resolve().parent.parent / ".local" / "tools" / "pgsql" / "bin"
    candidate = local / ("pg_dump.exe" if os.name == "nt" else "pg_dump")
    if candidate.exists():
        return str(candidate)
    raise SystemExit("pg_dump was not found. Install PostgreSQL client tools or pass --pg-dump.")


def dump_database(pg_dump: str, database_url: str, target: Path, schemas: list[str]) -> dict:
    env = {**os.environ, **libpq_environment(database_url)}
    command = [pg_dump, "--format=custom", "--no-owner", "--no-privileges", f"--file={target}"]
    command += [f"--schema={schema}" for schema in schemas]
    result = subprocess.run(command, env=env, capture_output=True, text=True)
    if result.returncode != 0:
        # pg_dump messages do not contain the password (it is only in PGPASSWORD).
        raise SystemExit(f"pg_dump failed: {result.stderr.strip()[:500]}")
    version = subprocess.run([pg_dump, "--version"], capture_output=True, text=True).stdout
    return {
        "file": target.name,
        "bytes": target.stat().st_size,
        "sha256": digest(target),
        "pg_dump": version.strip(),
        "schemas": schemas or "all",
    }


def migration_revision(database_url: str) -> str | None:
    try:
        import psycopg
    except ImportError:
        return None
    env = libpq_environment(database_url)
    try:
        with psycopg.connect(
            host=env["PGHOST"],
            port=env.get("PGPORT", "5432"),
            dbname=env["PGDATABASE"],
            user=env.get("PGUSER"),
            password=env.get("PGPASSWORD"),
            sslmode=env.get("PGSSLMODE", "prefer"),
            connect_timeout=10,
        ) as connection:
            row = connection.execute("SELECT version_num FROM alembic_version").fetchone()
            return row[0] if row else None
    except psycopg.Error:
        return None


def list_objects(client, base: str, bucket: str, prefix: str = "") -> list[str]:
    """Return every object name in the bucket. Folder entries have no id and are walked."""
    names: list[str] = []
    offset = 0
    while True:
        response = client.post(
            f"{base}/storage/v1/object/list/{bucket}",
            json={"prefix": prefix, "limit": LIST_LIMIT, "offset": offset},
        )
        response.raise_for_status()
        entries = response.json()
        for entry in entries:
            name = f"{prefix}{entry['name']}"
            if entry.get("id") is None:
                names += list_objects(client, base, bucket, f"{name}/")
            else:
                names.append(name)
        if len(entries) < LIST_LIMIT:
            return names
        offset += LIST_LIMIT


def backup_storage(base: str, key: str, bucket: str, target: Path) -> dict:
    import httpx

    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    files = []
    with httpx.Client(headers=headers, timeout=60) as client:
        for name in sorted(list_objects(client, base, bucket)):
            relative = safe_object_path(name)
            destination = target / bucket / Path(*relative.parts)
            destination.parent.mkdir(parents=True, exist_ok=True)
            with client.stream("GET", f"{base}/storage/v1/object/{bucket}/{name}") as response:
                response.raise_for_status()
                with destination.open("wb") as handle:
                    for chunk in response.iter_bytes():
                        handle.write(chunk)
            files.append(
                {"name": name, "bytes": destination.stat().st_size, "sha256": digest(destination)}
            )
    return {"bucket": bucket, "objects": len(files), "files": files}


def prune(out: Path, keep: int) -> list[str]:
    """Delete the oldest complete backups beyond ``keep``. Other folders are never touched."""
    complete = sorted(
        path
        for path in out.iterdir()
        if path.is_dir() and NAME.match(path.name) and (path / "manifest.json").exists()
    )
    removed = []
    for path in complete[: max(len(complete) - keep, 0)]:
        shutil.rmtree(path)
        removed.append(path.name)
    return removed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, required=True, help="Folder that holds backups.")
    parser.add_argument("--env-file", type=Path, help="Read settings from this KEY=VALUE file.")
    parser.add_argument("--bucket", action="append", help="Storage bucket (default: evidence).")
    parser.add_argument("--skip-storage", action="store_true", help="Database only; recorded.")
    parser.add_argument("--keep", type=int, help="Keep this many complete backups.")
    parser.add_argument("--pg-dump", help="Path to pg_dump.")
    args = parser.parse_args(argv)

    settings = {**(load_env_file(args.env_file) if args.env_file else {}), **os.environ}
    database_url = settings.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("Set DATABASE_URL (the application database).")
    if args.keep is not None and args.keep < 1:
        raise SystemExit("--keep must be at least 1.")

    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    args.out.mkdir(parents=True, exist_ok=True)
    final = args.out / f"infrashader-{stamp}"
    work = args.out / f"{final.name}.partial"
    work.mkdir()

    pg_dump = find_pg_dump(args.pg_dump)
    manifest: dict = {
        "format": "infrashader.backup.v1",
        "created_at": datetime.now(UTC).isoformat(),
        "migration_revision": migration_revision(database_url),
        "application_database": dump_database(pg_dump, database_url, work / "app.dump", []),
        "skipped": [],
    }
    print(f"Application database dumped ({manifest['application_database']['bytes']} bytes).")

    auth_url = settings.get("AUTH_DATABASE_URL")
    if auth_url:
        manifest["identity_database"] = dump_database(
            pg_dump, auth_url, work / "identity.dump", ["auth"]
        )
        print("Identity database (auth schema) dumped.")
    else:
        manifest["skipped"].append(
            "identity database: AUTH_DATABASE_URL not set (hosted Supabase keeps its own backups)"
        )

    if args.skip_storage:
        manifest["skipped"].append("private Storage files: --skip-storage")
    else:
        base, key = settings.get("SUPABASE_URL"), settings.get("STORAGE_SERVICE_KEY")
        if not base or not key:
            raise SystemExit(
                "Set SUPABASE_URL and STORAGE_SERVICE_KEY, or pass --skip-storage knowingly."
            )
        manifest["storage"] = [
            backup_storage(base.rstrip("/"), key, bucket, work / "storage")
            for bucket in (args.bucket or ["evidence"])
        ]
        for entry in manifest["storage"]:
            print(f"Storage bucket {entry['bucket']}: {entry['objects']} objects.")

    (work / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    work.rename(final)
    print(f"Backup complete: {final}")
    if manifest["skipped"]:
        print("Skipped: " + "; ".join(manifest["skipped"]))
    if args.keep:
        for name in prune(args.out, args.keep):
            print(f"Removed old backup {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
