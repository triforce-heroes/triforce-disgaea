import { readFile } from "node:fs/promises";

import { BufferBuilder } from "@triforce-heroes/triforce-core";
import { describe, expect, it } from "vitest";

import { extract } from "#/Extract";
import { rebuild } from "#/Rebuild";
import { getRecordKey, isTextField, payloadsStructures } from "#/types/Database";

function createDialogData(lines: string[][]) {
  const record = new BufferBuilder()
    .writeUnsignedInt32(7)
    .writeLengthPrefixedString("TEST\0")
    .push(Buffer.alloc(8))
    .writeUnsignedInt32(lines.length);

  for (const line of lines) {
    for (const text of line) {
      record.writeLengthPrefixedString(`${text}\0`);
    }
  }

  return new BufferBuilder()
    .writeUnsignedInt32(1)
    .writeUnsignedInt32(record.length)
    .push(record.build())
    .build();
}

describe("dialog", () => {
  const filename = "tutorial.dat";
  const key = "TUTORIAL_002_0003_01";

  it("preserves a dialog with no lines", () => {
    expect.assertions(2);

    const data = createDialogData([]);
    const records = extract(data, "taskList.dat");

    expect(
      records
        .at(0)
        ?.filter((field) => isTextField(field))
        .filter(([type]) => type === "dialog")
        .map((field) => field.at(3)),
    ).toStrictEqual([0]);
    expect(rebuild(data, "taskList.dat", new Map()).equals(data)).toBe(true);
  });

  interface OriginalNewline {
    name: string;
    text: string;
  }

  const originalNewlines: OriginalNewline[] = [
    { name: "LF", text: "First\nSecond" },
    { name: "CRLF", text: "First\r\nSecond" },
  ];

  it.each(originalNewlines)("rejects $name inside an original dialog line", ({ text }) => {
    expect.assertions(1);

    const data = createDialogData([["JP", text, "FR", "ES", "ZH", "KO"]]);

    expect(() => extract(data, "taskList.dat")).toThrow(/dialog|newline|line break/iv);
  });

  it("joins each page into one string per language and preserves space tags", async () => {
    expect.assertions(2);

    const data = await readFile(`tests/fixtures/${filename}`);
    const records = extract(data, filename);
    const record = records.find((fields) => getRecordKey(fields) === key)!;
    const dialogs = record
      .filter((field) => isTextField(field))
      .filter(([type]) => type === "dialog");
    const [type, texts, offset, linesCount] = dialogs.at(0)!;

    expect(dialogs.map((field) => field.at(3))).toStrictEqual([5, 5, 5]);
    expect([type, texts.en, offset, linesCount]).toStrictEqual([
      "dialog",
      [
        "At the <c t_notice>General Store (Rosen Queen Co.)</c>, you can buy and sell",
        "items.",
        "<space>",
        "The General Store stocks weapons, armor, accessories, and",
        "recovery items\u2014everything you need for glorious combat.",
      ].join("\n"),
      "6.0",
      5,
    ]);
  });

  interface DialogReplacement {
    name: string;
    text: string;
    lines: string[];
  }

  const replacements: DialogReplacement[] = [
    {
      name: "shorter text",
      text: "Uma\nduas\ntrês",
      lines: ["Uma", "duas", "três", "<space>", "<space>"],
    },
    { name: "overflow", text: "1\n2\n3\n4\n5\n6", lines: ["1", "2", "3", "4", "5"] },
    {
      name: "empty inner lines",
      text: "Uma\n\ntrês",
      lines: ["Uma", "<space>", "três", "<space>", "<space>"],
    },
    {
      name: "existing space tags",
      text: "Uma\n<space>\ntrês",
      lines: ["Uma", "<space>", "três", "<space>", "<space>"],
    },
    {
      name: "empty text",
      text: "",
      lines: ["<space>", "<space>", "<space>", "<space>", "<space>"],
    },
    {
      name: "Windows newlines",
      text: "Uma\r\nduas\rtrês",
      lines: ["Uma", "duas", "três", "<space>", "<space>"],
    },
  ];

  it.each(replacements)("rebuilds $name using exactly five lines", async ({ text, lines }) => {
    expect.assertions(1);

    const data = await readFile(`tests/fixtures/${filename}`);
    const expectedRecords = extract(data, filename);
    const record = expectedRecords.find((fields) => getRecordKey(fields) === key)!;
    const [, texts] = record
      .filter((field) => isTextField(field))
      .filter(([type]) => type === "dialog")
      .find((field) => field.at(2) === "6.0")!;
    const rebuilt = rebuild(data, filename, new Map([[`${key}#6.0`, text]]));

    texts.en = lines.join("\n");

    expect(extract(rebuilt, filename)).toStrictEqual(expectedRecords);
  });

  interface TestFile {
    file: string;
  }

  const files: TestFile[] = payloadsStructures
    .keys()
    .map((file) => ({ file }))
    .toArray();

  it.each(files)(
    "preserves original empty lines and tags in unchanged $file translations",
    async ({ file }) => {
      expect.assertions(1);

      const data = await readFile(`tests/fixtures/${file}`);
      const records = extract(data, file);
      const originalTexts = new Map<string, string>();

      for (const record of records) {
        const reference = getRecordKey(record)!;

        for (const [, texts, offset] of record.filter((field) => isTextField(field))) {
          originalTexts.set(`${reference}#${offset}`, texts.en);
        }
      }

      expect(rebuild(data, file, originalTexts).equals(data)).toBe(true);
    },
  );
});
