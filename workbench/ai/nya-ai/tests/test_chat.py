import json
import os
import tempfile
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from nya_chat import chat as chat_module


def make_response(content):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))],
    )


def make_chunk(content):
    return SimpleNamespace(
        choices=[SimpleNamespace(delta=SimpleNamespace(content=content))],
    )


class RecordingCompletions:
    def __init__(self):
        self.calls = []

    def create(self, **params):
        self.calls.append(params)
        prompt = params["messages"][-1]["content"]
        if "first" in prompt:
            return make_response("reply:first")
        if "second" in prompt:
            return make_response("reply:second")
        return make_response("reply")


class CoordinatedCompletions(RecordingCompletions):
    def __init__(self):
        super().__init__()
        self.state_lock = threading.Lock()
        self.first_api_entered = threading.Event()
        self.second_api_entered = threading.Event()
        self.release_first_api = threading.Event()
        self.active_calls = 0
        self.max_active_calls = 0

    def create(self, **params):
        with self.state_lock:
            call_number = len(self.calls) + 1
            self.calls.append(params)
            self.active_calls += 1
            self.max_active_calls = max(self.max_active_calls, self.active_calls)

        if call_number == 1:
            self.first_api_entered.set()
            self.release_first_api.wait(timeout=2)
        else:
            self.second_api_entered.set()

        prompt = params["messages"][-1]["content"]
        reply = "reply:first" if "first" in prompt else "reply:second"
        with self.state_lock:
            self.active_calls -= 1
        return make_response(reply)


class StreamingCompletions(RecordingCompletions):
    def __init__(self):
        super().__init__()
        self.non_stream_api_entered = threading.Event()

    def create(self, **params):
        self.calls.append(params)
        if params["stream"]:
            return iter([make_chunk("A"), make_chunk("B")])

        self.non_stream_api_entered.set()
        return make_response("reply:second")


class FailingCompletions:
    def create(self, **_params):
        raise RuntimeError("provider failed")


class TestOpenAICompatibleChat(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.config = {
            "BASE_URL": "https://example.invalid/v1",
            "MODEL": "test-model",
            "TEMPERATURE": 0.5,
            "MAX_TOKENS": 100,
            "MAX_RETRIES": 1,
            "RETRY_DELAY": 0,
            "TIMEOUT_SECONDS": 1,
            "HISTORY_FILE": str(self.root / "history.json"),
            "SYSTEM_PROMPT": "system prompt",
            "RELATIONSHIP_LEVELS": [30, 70],
            "RELATIONSHIP_TONES": ["cold", "warm", "close"],
            "RELATIONSHIP_EMOJIS": ["", "", ""],
        }

    def tearDown(self):
        self.temporary_directory.cleanup()

    def create_service(self, completions, history_file=None):
        fake_client = SimpleNamespace(
            chat=SimpleNamespace(completions=completions),
        )
        with mock.patch.object(chat_module, "OpenAI", return_value=fake_client):
            return chat_module.OpenAICompatibleChat(
                api_key="test-key",
                config=self.config,
                history_file=str(history_file or self.root / "history.json"),
            )

    def test_concurrent_non_stream_requests_do_not_interleave_history(self):
        completions = CoordinatedCompletions()
        service = self.create_service(completions)
        results = {}
        errors = []
        second_request_started = threading.Event()

        def request(name):
            try:
                if name == "second":
                    second_request_started.set()
                results[name] = service.get_response(name, 100)
            except Exception as error:
                errors.append(error)

        first_thread = threading.Thread(target=request, args=("first",))
        second_thread = threading.Thread(target=request, args=("second",))
        first_thread.start()
        self.assertTrue(completions.first_api_entered.wait(timeout=2))
        second_thread.start()
        self.assertTrue(second_request_started.wait(timeout=2))
        self.assertFalse(completions.second_api_entered.wait(timeout=0.1))

        completions.release_first_api.set()
        first_thread.join(timeout=2)
        second_thread.join(timeout=2)

        self.assertFalse(first_thread.is_alive())
        self.assertFalse(second_thread.is_alive())
        self.assertEqual(errors, [])
        self.assertEqual(results, {"first": "reply:first", "second": "reply:second"})
        self.assertEqual(completions.max_active_calls, 1)
        self.assertEqual(
            [item["role"] for item in service.conversation_history],
            ["system", "user", "assistant", "user", "assistant"],
        )
        self.assertIn("first", service.conversation_history[1]["content"])
        self.assertEqual(service.conversation_history[2]["content"], "reply:first")
        self.assertIn("second", service.conversation_history[3]["content"])
        self.assertEqual(service.conversation_history[4]["content"], "reply:second")

    def test_stream_holds_transaction_lock_until_generator_finishes(self):
        completions = StreamingCompletions()
        service = self.create_service(completions)
        stream = service.get_response("stream", 100, stream=True)
        self.assertEqual(next(stream), "A")
        result = []

        second_thread = threading.Thread(
            target=lambda: result.append(service.get_response("second", 100)),
        )
        second_thread.start()
        self.assertFalse(completions.non_stream_api_entered.wait(timeout=0.1))

        self.assertEqual(list(stream), ["B"])
        second_thread.join(timeout=2)

        self.assertFalse(second_thread.is_alive())
        self.assertEqual(result, ["reply:second"])
        self.assertEqual(
            [item["role"] for item in service.conversation_history],
            ["system", "user", "assistant", "user", "assistant"],
        )
        self.assertEqual(service.conversation_history[2]["content"], "AB")

    def test_closing_stream_commits_partial_reply_and_releases_lock(self):
        completions = StreamingCompletions()
        service = self.create_service(completions)
        stream = service.get_response("stream", 100, stream=True)

        self.assertEqual(next(stream), "A")
        stream.close()
        reply = service.get_response("second", 100)

        self.assertEqual(reply, "reply:second")
        self.assertEqual(service.conversation_history[2]["content"], "A")

    def test_failed_request_rolls_back_user_history(self):
        history_file = self.root / "history.json"
        service = self.create_service(FailingCompletions(), history_file)
        original_history = json.loads(history_file.read_text(encoding="utf-8"))

        with self.assertRaisesRegex(RuntimeError, "provider failed"):
            service.get_response("failed", 100)

        self.assertEqual(service.conversation_history, original_history)
        self.assertEqual(json.loads(history_file.read_text(encoding="utf-8")), original_history)

    def test_repeated_cached_response_calls_still_update_history(self):
        completions = RecordingCompletions()
        service = self.create_service(completions)

        service.get_cached_response("same", 100)
        service.get_cached_response("same", 100)

        self.assertEqual(len(completions.calls), 2)
        self.assertEqual(
            [item["role"] for item in service.conversation_history],
            ["system", "user", "assistant", "user", "assistant"],
        )

    def test_create_completion_is_stateless(self):
        completions = RecordingCompletions()
        service = self.create_service(completions)
        original_history = [item.copy() for item in service.conversation_history]
        request_messages = [{"role": "user", "content": "stateless"}]

        service.create_completion(request_messages)

        self.assertEqual(service.conversation_history, original_history)
        self.assertEqual(completions.calls[0]["messages"], request_messages)

    def test_history_save_creates_parent_and_atomically_replaces(self):
        completions = RecordingCompletions()
        history_file = self.root / "nested" / "history" / "conversation.json"
        replace_calls = []
        real_replace = os.replace

        def capture_replace(source, destination):
            source_path = Path(source)
            replace_calls.append((source_path, Path(destination)))
            self.assertEqual(source_path.parent, history_file.parent)
            real_replace(source, destination)

        with mock.patch.object(chat_module.os, "replace", side_effect=capture_replace):
            service = self.create_service(completions, history_file)

        self.assertTrue(history_file.is_file())
        self.assertEqual(len(replace_calls), 1)
        self.assertEqual(replace_calls[0][1], history_file)
        self.assertFalse(replace_calls[0][0].exists())
        self.assertEqual(
            json.loads(history_file.read_text(encoding="utf-8")),
            service.conversation_history,
        )

    def test_failed_atomic_replace_preserves_existing_history_and_cleans_temp(self):
        history_file = self.root / "history.json"
        original_history = [{"role": "system", "content": "existing"}]
        history_file.write_text(json.dumps(original_history), encoding="utf-8")
        service = self.create_service(RecordingCompletions(), history_file)
        service.conversation_history.append({"role": "user", "content": "new"})

        with mock.patch.object(chat_module.os, "replace", side_effect=OSError("replace failed")):
            with self.assertRaisesRegex(OSError, "replace failed"):
                service.save_history()

        self.assertEqual(json.loads(history_file.read_text(encoding="utf-8")), original_history)
        self.assertEqual(list(history_file.parent.glob(f".{history_file.name}.*.tmp")), [])

    def test_history_loader_only_accepts_valid_role_and_content(self):
        history_file = self.root / "history.json"
        history_file.write_text(
            json.dumps(
                [
                    {"role": "system", "content": "valid", "ignored": True},
                    {"role": "admin", "content": "invalid role"},
                    {"role": ["user"], "content": "invalid role type"},
                    {"role": "user", "content": 123},
                    {"role": "assistant", "content": ""},
                    "not an object",
                ]
            ),
            encoding="utf-8",
        )

        service = self.create_service(RecordingCompletions(), history_file)

        self.assertEqual(
            service.conversation_history,
            [
                {"role": "system", "content": "valid"},
                {"role": "assistant", "content": ""},
            ],
        )


if __name__ == "__main__":
    unittest.main()
