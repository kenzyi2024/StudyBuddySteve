"""Unit tests for the parser (regex/classification path). Run: python3 -m unittest"""
import unittest

from parser import classify, parse_text, find_course, find_term, _dedupe


SAMPLE = """CS 101: Introduction to Computer Science
Fall 2026

Problem Set 1 due September 14 at 11:59pm
Quiz 1 will be held on 9/21 at 10:00 AM
Midterm Exam: October 20, 2026 from 10:00am to 11:30am
Read Chapter 3, Sections 3.1 - 3.5
"""


class TestClassify(unittest.TestCase):
    def test_types(self):
        self.assertEqual(classify("Midterm Exam"), "exam")
        self.assertEqual(classify("Quiz 1"), "quiz")
        self.assertEqual(classify("Read Chapter 3, Sections 3.1-3.5"), "reading")
        self.assertEqual(classify("Submit Homework #4"), "homework")
        self.assertEqual(classify("Submit Chapter 6 online problems"), "homework")
        self.assertEqual(classify("Final Project Proposal"), "project")
        self.assertEqual(classify("Start working on Homework #2"), "study")


class TestHeader(unittest.TestCase):
    def test_course_and_term(self):
        self.assertEqual(find_course(SAMPLE), "CS 101")
        self.assertEqual(find_term(SAMPLE), "Fall 2026")


class TestExtraction(unittest.TestCase):
    def test_finds_dated_events(self):
        events = parse_text(SAMPLE, use_llm=False)["events"]
        self.assertGreaterEqual(len(events), 3)
        titles = " ".join(e["title"].lower() for e in events)
        self.assertIn("problem set 1", titles)
        # a timed event should not be all-day
        pset = next(e for e in events if "problem set 1" in e["title"].lower())
        self.assertFalse(pset["allDay"])
        self.assertTrue(pset["due"].startswith("2026-09-14"))

    def test_dedupe_keeps_earliest(self):
        merged = _dedupe(
            [
                {"title": "HW1", "due": "2026-09-20T23:59:00", "type": "homework"},
                {"title": "HW1", "due": "2026-09-14T23:59:00", "type": "homework"},
            ]
        )
        self.assertEqual(len(merged), 1)
        self.assertTrue(merged[0]["due"].startswith("2026-09-14"))


if __name__ == "__main__":
    unittest.main()
