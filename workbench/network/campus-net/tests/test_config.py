import unittest

from main import build_runtime_from_config, is_network_available, portal_base_url


class TestConfig(unittest.TestCase):
    def test_portal_base_url_uses_configured_origin(self):
        self.assertEqual(
            portal_base_url("https://campus.example/eportal/InterFace.do?method=login"),
            "https://campus.example/",
        )

    def test_build_runtime_uses_configured_portal(self):
        runtime = build_runtime_from_config(
            {
                "login_url": "https://campus.example/eportal/login",
                "connectivity_check_url": "https://connectivity.example/status",
                "service": "carrier",
                "cookies": {
                    "EPORTAL_COOKIE_USERNAME": "example-student",
                    "EPORTAL_COOKIE_PASSWORD": "example-encrypted-password",
                    "JSESSIONID": "example-session",
                },
            }
        )

        login_url, portal_url, check_url, headers, cookies, service = runtime
        self.assertEqual(login_url, "https://campus.example/eportal/login")
        self.assertEqual(portal_url, "https://campus.example/")
        self.assertEqual(check_url, "https://connectivity.example/status")
        self.assertEqual(headers["Host"], "campus.example")
        self.assertEqual(headers["JSESSIONID"], "example-session")
        self.assertEqual(cookies["EPORTAL_COOKIE_USERNAME"], "example-student")
        self.assertEqual(service, "carrier")

    def test_rejects_incomplete_login_url(self):
        with self.assertRaises(ValueError):
            portal_base_url("campus.example/eportal/login")

    def test_build_runtime_uses_configured_user_group(self):
        runtime = build_runtime_from_config(
            {
                "login_url": "https://campus.example/eportal/login",
                "user_group": "student",
                "cookies": {},
            }
        )

        self.assertEqual(runtime[4]["EPORTAL_USER_GROUP"], "student")

    def test_explicit_cookie_user_group_takes_precedence(self):
        runtime = build_runtime_from_config(
            {
                "login_url": "https://campus.example/eportal/login",
                "user_group": "student",
                "cookies": {"EPORTAL_USER_GROUP": "teacher"},
            }
        )

        self.assertEqual(runtime[4]["EPORTAL_USER_GROUP"], "teacher")

    def test_connectivity_check_rejects_error_status(self):
        self.assertFalse(is_network_available(500, "upstream error", "", "campus.example"))

    def test_connectivity_check_rejects_portal_redirect(self):
        self.assertFalse(
            is_network_available(
                302,
                "",
                "https://campus.example/eportal/login",
                "campus.example",
            )
        )

    def test_connectivity_check_accepts_success_without_portal(self):
        self.assertTrue(is_network_available(204, "", "", "campus.example"))


if __name__ == "__main__":
    unittest.main()
