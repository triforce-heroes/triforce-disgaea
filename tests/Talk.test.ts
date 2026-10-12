import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { extract, LANGUAGES } from "#/Extract";
import { rebuild } from "#/Rebuild";
import { getRecordKey, isTextField } from "#/types/Database";

interface TalkLine {
  languages: string[];
  suffix: Buffer;
}

interface TalkCommand {
  code: number;
  lists: number[][];
  strings: string[];
  header: Buffer;
  lines: TalkLine[];
}

interface TalkRecord {
  id: number;
  key: string;
  lists: number[][];
  commands: TalkCommand[];
  tail: Buffer;
}

function readTalk(data: Buffer): TalkRecord[] {
  let offset = 0;

  function readNumber() {
    const value = data.readUInt32LE(offset);
    offset += 4;
    return value;
  }
  function readBuffer(length: number) {
    const value = data.subarray(offset, offset + length);
    offset += length;
    return value;
  }
  function readString() {
    const value = readBuffer(readNumber());

    if (value.at(-1) !== 0) {
      throw new Error("missing string terminator");
    }

    return value.subarray(0, -1).toString("utf-8");
  }
  function readList() {
    return Array.from({ length: readNumber() }, () => readNumber());
  }
  const records = Array.from({ length: readNumber() }, () => {
    const length = readNumber();
    const end = offset + length;
    const id = readNumber();
    const key = readString();
    const lists = [readList(), readList()];
    const commands = Array.from({ length: readNumber() }, () => ({
      code: readNumber(),
      lists: [readList(), readList()],
      strings: [readString(), readString()],
      header: readBuffer(40),
      lines: Array.from({ length: readNumber() }, () => ({
        languages: LANGUAGES.map(() => readString()),
        suffix: readBuffer(4),
      })),
    }));
    const tail = readBuffer(16);

    if (offset !== end) {
      throw new Error(`invalid record boundary: ${key}`);
    }

    return { id, key, lists, commands, tail };
  });

  if (offset !== data.length) {
    throw new Error("unconsumed file bytes");
  }

  return records;
}

function getTalkTextFields(record: TalkRecord): unknown[][] {
  return record.commands.flatMap<unknown[]>((command, commandIndex) =>
    command.code === 2
      ? [
          [
            "dialog",
            Object.fromEntries(
              LANGUAGES.map((language, languageIndex) => [
                language,
                command.lines
                  .map((line) => line.languages[languageIndex])
                  .join("\n")
                  .replaceAll(/\n+$/gv, ""),
              ]),
            ),
            `4.${commandIndex}`,
            command.lines.length,
            command.lines.map((line) => line.suffix),
          ],
        ]
      : command.lines.map((line, lineIndex) => [
          "languages",
          Object.fromEntries(
            LANGUAGES.map((language, languageIndex) => [language, line.languages[languageIndex]]),
          ),
          `4.${commandIndex}.${lineIndex}`,
        ]),
  );
}

function translateTalkRecords(records: TalkRecord[]): Map<string, string> {
  const replacements = new Map<string, string>();

  for (const record of records) {
    for (const [commandIndex, command] of record.commands.entries()) {
      const translatedLines: string[] = [];

      for (const [lineIndex, line] of command.lines.entries()) {
        const reference = `${record.key}#4.${commandIndex}`;
        const text = `Tradução ${reference}.${lineIndex}: ação, coração, Ã, Õ, ç e Ç.`;

        translatedLines.push(text);
        line.suffix.writeUInt32LE(lineIndex + commandIndex + 1);

        if (command.code !== 2) {
          replacements.set(`${reference}.${lineIndex}`, text);
        }

        line.languages[1] = text;
      }

      if (command.code === 2) {
        replacements.set(`${record.key}#4.${commandIndex}`, translatedLines.join("\n"));
      }
    }
  }

  return replacements;
}

describe("talk", () => {
  const filename = "talk.dat";

  it("groups continuation lines into one editable dialog without trailing empty lines", async () => {
    expect.assertions(1);

    const data = await readFile(`tests/fixtures/${filename}`);
    const record = extract(data, filename).find(
      (fields) => getRecordKey(fields) === "TALK_ID_0011_002_19",
    )!;

    expect(
      record
        .filter((field) => isTextField(field))
        .map(([type, texts, offset]) => [type, texts.en, offset]),
    ).toStrictEqual([
      [
        "dialog",
        "That so, huh? Then you'd better hurry up so you can get\nsome practice in.",
        "4.2",
      ],
    ]);
  });

  it("preserves opaque command data and extracts every localized line", async () => {
    expect.assertions(5);

    const data = await readFile(`tests/fixtures/${filename}`);
    const rawRecords = readTalk(data);
    const records = extract(data, filename);
    const commands = rawRecords.flatMap((record) => record.commands);
    const counts = rawRecords.map((record) => record.commands.length);
    const lineCounts = [...new Set(commands.map((command) => command.lines.length))];

    expect(records).toHaveLength(2007);
    expect([Math.min(...counts), Math.max(...counts)]).toStrictEqual([2, 20]);
    expect(lineCounts.toSorted((left, right) => left - right)).toStrictEqual([0, 1, 2, 3]);
    expect(records.map((record) => (record.at(-1)!.at(1) as Buffer).subarray(-16))).toStrictEqual(
      rawRecords.map((record) => record.tail),
    );
    expect(records.map((record) => record.filter((field) => isTextField(field)))).toStrictEqual(
      rawRecords.map((record) => getTalkTextFields(record)),
    );
  });

  it("replaces every English line while preserving all command data and other languages", async () => {
    expect.assertions(2);

    const data = await readFile(`tests/fixtures/${filename}`);
    const expected = readTalk(data);
    const replacements = translateTalkRecords(expected);

    const rebuilt = rebuild(data, filename, replacements);

    expect(readTalk(rebuilt)).toStrictEqual(expected);
    expect(rebuild(rebuilt, filename, new Map()).equals(rebuilt)).toBe(true);
  });

  it("replaces one dialog without changing adjacent commands", async () => {
    expect.assertions(2);

    const data = await readFile(`tests/fixtures/${filename}`);
    const expected = readTalk(data);
    const record = expected.find((entry) => entry.key === "TALK_ID_0001_001_10")!;
    const commandIndex = record.commands.findIndex((command) => command.lines.length === 2);

    expect(commandIndex).toBeGreaterThanOrEqual(0);

    const command = record.commands.at(commandIndex)!;
    command.lines.at(0)!.languages[1] = "Bem-vindo! <space>";
    const rebuilt = rebuild(
      data,
      filename,
      new Map([[`${record.key}#4.${commandIndex}`, "Bem-vindo! <space>\n<space>"]]),
    );

    command.lines.at(1)!.languages[1] = "<space>";

    expect(readTalk(rebuilt)).toStrictEqual(expected);
  });

  interface TalkReplacement {
    name: string;
    text: string;
    lines: string[];
  }

  const dialogReplacements: TalkReplacement[] = [
    { name: "three lines", text: "Uma\nduas\ntrês", lines: ["Uma", "duas", "três"] },
    { name: "shorter text", text: "Uma", lines: ["Uma", "<space>", "<space>"] },
    { name: "empty text", text: "", lines: ["<space>", "<space>", "<space>"] },
    { name: "internal blank line", text: "Uma\n\ntrês", lines: ["Uma", "<space>", "três"] },
    { name: "Windows newlines", text: "Uma\r\nduas\rtrês", lines: ["Uma", "duas", "três"] },
    { name: "overflow", text: "1\n2\n3\n4", lines: ["1", "2", "3"] },
  ];

  it.each(dialogReplacements)(
    "rebuilds $name preserving Talk capacity and suffixes",
    async ({ text, lines }) => {
      expect.assertions(1);

      const data = await readFile(`tests/fixtures/${filename}`);
      const expected = readTalk(data);
      const key = "TALK_ID_0011_002_19";
      const record = expected.find((entry) => entry.key === key)!;

      for (const [index, line] of record.commands.at(2)!.lines.entries()) {
        line.suffix.writeUInt32LE(index + 10);
        line.languages[1] = lines.at(index)!;
      }

      const rebuilt = rebuild(data, filename, new Map([[`${key}#4.2`, text]]));

      expect(readTalk(rebuilt)).toStrictEqual(expected);
    },
  );
});
