import unittest

from parse_screen_dimensions import (
    ParseError,
    docc_data_url,
    parse_document,
)


def document_with_rows(rows):
    return {
        "primaryContentSections": [
            {
                "kind": "content",
                "content": [
                    {
                        "type": "heading",
                        "level": 3,
                        "anchor": "iOS-iPadOS-device-screen-dimensions",
                        "text": "iOS, iPadOS device screen dimensions",
                    },
                    {"type": "table", "header": "row", "rows": rows},
                ],
            }
        ]
    }


def cell(text):
    return [{"type": "paragraph", "inlineContent": [{"type": "text", "text": text}]}]


class ScreenDimensionsParserTests(unittest.TestCase):
    def test_builds_docc_data_url_and_removes_fragment(self):
        page = (
            "https://developer.apple.com/design/human-interface-guidelines/"
            "layout#iOS-iPadOS-device-screen-dimensions"
        )
        self.assertEqual(
            docc_data_url(page),
            "https://developer.apple.com/tutorials/data/design/"
            "human-interface-guidelines/layout.json",
        )

    def test_parses_iphone_and_ipad_rows(self):
        document = document_with_rows(
            [
                [cell("Model"), cell("Dimensions (portrait)")],
                [cell("iPad Pro 13-inch"), cell("1032x1376 pt (2064x2752 px @2x)")],
                [cell("iPhone 16 Pro"), cell("402×874 pt (1206×2622 px @3x)")],
            ]
        )

        devices = parse_document(document)

        self.assertEqual(len(devices), 2)
        self.assertEqual(devices[0]["platform"], "iPadOS")
        self.assertEqual(devices[0]["portrait"]["points"]["width"], 1032)
        self.assertEqual(devices[1]["platform"], "iOS")
        self.assertEqual(devices[1]["portrait"]["pixels"]["height"], 2622)
        self.assertEqual(devices[1]["portrait"]["scale"], 3)

    def test_rejects_changed_dimension_format(self):
        document = document_with_rows(
            [
                [cell("Model"), cell("Dimensions (portrait)")],
                [cell("iPhone Example"), cell("unknown")],
            ]
        )
        with self.assertRaises(ParseError):
            parse_document(document)


if __name__ == "__main__":
    unittest.main()
