"""TEST ONLY: signed identity + real disposable PostGIS + explicit memory file double.

Used to test the browser PDF renderer when local Supabase is unavailable. This is
not Auth/Storage acceptance evidence and is never imported by application code.
"""

from app import evidence
from tests.browser_server import app  # noqa: F401


class FixtureStorage:
    objects = {}

    def __init__(self, settings):
        pass

    def put(self, path, content, content_type):
        self.objects[path] = content

    def get(self, path):
        return self.objects[path]

    def delete(self, path):
        self.objects.pop(path, None)


evidence.PrivateStorage = FixtureStorage
