"""Project-local Windows PostgreSQL/PostGIS. No service registration or hosted resources."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / '.local'
BIN = LOCAL / 'tools' / 'pgsql' / 'bin'
DATA = LOCAL / 'postgres-data'
CONFIG = LOCAL / 'database.json'
PORT = 54322
PACKAGES = {
    'postgresql.zip': ('https://get.enterprisedb.com/postgresql/postgresql-17.11-5-windows-x64-binaries.zip', None),
    'postgis.zip': ('https://download.osgeo.org/postgis/windows/pg17/postgis-bundle-pg17-3.6.2x64.zip', 'faca768cc580c4ab2eef621be05b408e'),
}


def run(name, *args, input=None, env=None, check=True):
    return subprocess.run([str(BIN / (name + '.exe')), *map(str, args)], input=input,
                          text=True, env=env, check=check,
                          creationflags=subprocess.CREATE_NO_WINDOW)


def configuration():
    return json.loads(CONFIG.read_text(encoding='utf-8'))


def install():
    target = LOCAL / 'tools'
    for name, (url, checksum) in PACKAGES.items():
        marker = target / ('.' + name + '.installed')
        if marker.exists():
            continue
        archive = LOCAL / 'downloads' / name
        archive.parent.mkdir(parents=True, exist_ok=True)
        if not archive.exists():
            print(f'Downloading {name} from the official distributor...', flush=True)
            temporary = archive.with_suffix('.download')
            urllib.request.urlretrieve(url, temporary)
            temporary.replace(archive)
        if checksum and hashlib.md5(archive.read_bytes()).hexdigest() != checksum:
            raise SystemExit(f'{archive}: published checksum mismatch; remove this exact file and retry.')
        with zipfile.ZipFile(archive) as bundle:
            for entry in bundle.infolist():
                parts = Path(entry.filename).parts
                if name == 'postgresql.zip':
                    if len(parts) > 1 and parts[1] in ('pgAdmin 4', 'StackBuilder'):
                        continue
                    relative = Path(entry.filename)
                else:
                    # Official PostGIS bundle has a versioned top-level folder.
                    relative = Path('pgsql').joinpath(*parts[1:])
                destination = (target / relative).resolve()
                if not destination.is_relative_to(target.resolve()):
                    raise SystemExit('Unsafe archive member')
                if entry.is_dir():
                    destination.mkdir(parents=True, exist_ok=True)
                else:
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_bytes(bundle.read(entry))
        marker.write_text(url + '\nSHA256 ' + hashlib.sha256(archive.read_bytes()).hexdigest(), encoding='utf-8')
    if not CONFIG.exists():
        LOCAL.mkdir(exist_ok=True)
        CONFIG.write_text(json.dumps({'port': PORT, 'admin_password': secrets.token_urlsafe(32),
                                     'app_password': secrets.token_urlsafe(32)}, indent=2), encoding='utf-8')
    config = configuration()
    if not (DATA / 'PG_VERSION').exists():
        password_file = LOCAL / 'init-password.txt'
        password_file.write_text(config['admin_password'], encoding='utf-8')
        try:
            run('initdb', '-D', DATA, '-U', 'postgres', '--encoding=UTF8', '--locale=C',
                '--auth=scram-sha-256', '--pwfile', password_file)
        finally:
            password_file.unlink(missing_ok=True)
    start()
    environment = {**os.environ, 'PGPASSWORD': config['admin_password']}
    def sql(statement, database='postgres'):
        run('psql', '-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', config['port'],
            '-U', 'postgres', '-d', database, input=statement, env=environment)
    # Credentials are generated from a URL-safe alphabet and passed over stdin, never argv/logs.
    sql("DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='infrashader') THEN "
        f"CREATE ROLE infrashader LOGIN PASSWORD '{config['app_password']}'; END IF; END $$;")
    for database in ('infrashader', 'infrashader_test'):
        sql(f"SELECT 'CREATE DATABASE {database} OWNER infrashader' WHERE NOT EXISTS "
            f"(SELECT FROM pg_database WHERE datname='{database}')\n\\gexec\n")
        sql('CREATE EXTENSION IF NOT EXISTS postgis; SELECT postgis_version();', database)
    print('Local PostgreSQL/PostGIS ready on 127.0.0.1:' + str(config['port']))
    print('Credentials stay in ignored .local/database.json. scripts/api.ps1 loads them automatically.')


def start():
    config = configuration()
    if run('pg_ctl', '-D', DATA, 'status', check=False).returncode == 0:
        return
    run('pg_ctl', '-D', DATA, '-l', LOCAL / 'postgres.log', '-o',
        f"-h 127.0.0.1 -p {config['port']}", '-w', 'start')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('task', choices=['setup', 'start', 'stop', 'status'])
    args = parser.parse_args()
    if os.name != 'nt':
        parser.error('This portable installer is Windows-only; use compose.local.yml elsewhere.')
    if args.task == 'setup':
        install()
    elif args.task == 'start':
        start()
    elif args.task == 'stop':
        run('pg_ctl', '-D', DATA, '-m', 'fast', '-w', 'stop')
    else:
        run('pg_ctl', '-D', DATA, 'status')
