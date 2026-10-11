"""Tests for parser caller authentication. Run: python3 -m unittest"""
import unittest

from security import is_authorized


class TestAuthorization(unittest.TestCase):
    def test_open_when_no_secret_configured(self):
        self.assertTrue(is_authorized(None, ""))
        self.assertTrue(is_authorized(None, None))

    def test_requires_matching_key_when_configured(self):
        self.assertTrue(is_authorized("s3cret", "s3cret"))
        self.assertFalse(is_authorized(None, "s3cret"))
        self.assertFalse(is_authorized("", "s3cret"))
        self.assertFalse(is_authorized("wrong", "s3cret"))


if __name__ == "__main__":
    unittest.main()
