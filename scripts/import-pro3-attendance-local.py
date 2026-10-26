"""Copy PRO3 attendance tables into an independent local SQLite file.
Never writes the source. Refuses to overwrite an existing target.
Usage: python3 scripts/import-pro3-attendance-local.py SOURCE.sqlite TARGET.sqlite
"""
import pathlib
import sqlite3
import sys

source = pathlib.Path(sys.argv[1]).resolve()
target = pathlib.Path(sys.argv[2]).resolve()
if source == target or target.exists():
    raise SystemExit('Target must be a new, independent file')
target.parent.mkdir(parents=True, exist_ok=True)
origin = sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)
copy = sqlite3.connect(target)
tables = ['attendance_records', 'approval_instances', 'attendance_sync_log',
          'users', 'teams', 'anchors', 'dingtalk_users', 'dingtalk_departments',
          'stream_accounts', 'stream_schedules', 'anchor_attendance_notes',
          'anchor_daily_status', 'business_data']
try:
    for table in tables:
        schema = origin.execute('SELECT sql FROM sqlite_master WHERE type="table" AND name=?', (table,)).fetchone()
        if not schema:
            raise RuntimeError('Missing table: ' + table)
        copy.execute(schema[0])
        columns = [column[1] for column in origin.execute(f'PRAGMA table_info("{table}")')]
        query = f'SELECT * FROM "{table}"'
        if table == 'business_data':
            query += " WHERE type IN ('biz-anchor-live','biz-minigame','accounts')"
        placeholders = ','.join('?' for _ in columns)
        secret_indices = [i for i, column in enumerate(columns) if any(word in column.lower() for word in ('password', 'token', 'secret'))]
        count = 0
        for record in origin.execute(query):
            values = list(record)
            for index in secret_indices:
                values[index] = ''
            copy.execute(f'INSERT INTO "{table}" VALUES ({placeholders})', values)
            count += 1
        for index in origin.execute('SELECT sql FROM sqlite_master WHERE type="index" AND tbl_name=? AND sql IS NOT NULL', (table,)):
            copy.execute(index[0])
        copy.commit()
        print(table, count)
finally:
    origin.close()
    copy.close()
