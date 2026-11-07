"""Offline boundary checks; these tests never send a network request."""
import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from _local_api import api_json, local_base
from import_dev import configured_url


class LocalHelpersTest(unittest.TestCase):
    def test_backend_destination_is_loopback_only(self):
        self.assertEqual(local_base('http://127.0.0.1:8000/'),'http://127.0.0.1:8000')
        for value in ['https://example.com','http://example.com','http://key@localhost:8000','http://127.0.0.1:8000?secret=1']:
            with self.assertRaises(ValueError):
                local_base(value)

    def test_environment_file_is_data_not_shell(self):
        with TemporaryDirectory() as directory:
            file=Path(directory)/'backend.env'
            file.write_text('CQA_TEST_URL="https://example.com/source?signature=private"\nDANGEROUS=$(touch /never-execute)\n')
            with patch.dict(os.environ,{},clear=True):
                self.assertEqual(configured_url('CQA_TEST_URL',file),'https://example.com/source?signature=private')

    def test_network_errors_do_not_echo_signed_urls(self):
        with patch('_local_api.urlopen',side_effect=RuntimeError('https://example.com?signature=secret')):
            with self.assertRaisesRegex(ValueError,'Cannot read the local API') as raised:
                api_json('http://127.0.0.1:8000','/api/health')
            self.assertNotIn('secret',str(raised.exception))


if __name__ == '__main__':
    unittest.main()
