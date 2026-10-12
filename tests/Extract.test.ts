import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { extract } from "#/Extract";
import { isTextField, LANGUAGES, payloadsStructures, type TextField } from "#/types/Database";

type DialogField = Extract<TextField, [type: "dialog", ...values: unknown[]]>;

function encodeNumber(value: number): Buffer {
  const data = Buffer.alloc(4);

  data.writeUInt32LE(value);

  return data;
}

function createTable(payload: Buffer, payloadLength = payload.length, recordsCount = 1): Buffer {
  return Buffer.concat([encodeNumber(recordsCount), encodeNumber(payloadLength), payload]);
}

describe(extract, () => {
  interface TestFile {
    file: string;
  }

  const testFiles: TestFile[] = payloadsStructures
    .keys()
    .map((file) => ({ file }))
    .toArray();

  it.each(testFiles)("extracts $file", async ({ file }) => {
    expect.assertions(1);

    const data = await readFile(`tests/fixtures/${file}`);

    await expect(extract(data, file)).toMatchFileSnapshot(`snaps/${file}.snap`);
  });

  interface InvalidFile extends TestFile {
    name: string;
    data: Buffer;
    error: RegExp;
  }

  const emptyString = Buffer.from([1, 0, 0, 0, 0]);
  const emptyLanguages = Buffer.concat(LANGUAGES.map(() => emptyString));
  const simplePayload = Buffer.concat([Buffer.alloc(4), emptyString, emptyLanguages]);
  const invalidFiles: InvalidFile[] = [
    {
      name: "truncated file header",
      file: "dummy.dat",
      data: Buffer.alloc(3),
      error: /dummy\.dat.*header/v,
    },
    {
      name: "missing record length",
      file: "dummy.dat",
      data: encodeNumber(1),
      error: /dummy\.dat.*record 0/v,
    },
    {
      name: "payload shorter than its fields",
      file: "dummy.dat",
      data: createTable(simplePayload, simplePayload.length - 1),
      error: /dummy\.dat.*record 0/v,
    },
    {
      name: "payload extending beyond the file",
      file: "dummy.dat",
      data: createTable(simplePayload, simplePayload.length + 1),
      error: /dummy\.dat.*record 0/v,
    },
    {
      name: "zero string length",
      file: "dummy.dat",
      data: createTable(Buffer.concat([Buffer.alloc(8), emptyLanguages])),
      error: /dummy\.dat.*record 0/v,
    },
    {
      name: "string extending into the next record",
      file: "dummy.dat",
      data: Buffer.concat([
        encodeNumber(2),
        encodeNumber(simplePayload.length),
        Buffer.alloc(4),
        encodeNumber(simplePayload.length),
        simplePayload.subarray(8),
        encodeNumber(simplePayload.length),
        simplePayload,
      ]),
      error: /dummy\.dat.*record 0/v,
    },
    {
      name: "missing string terminator",
      file: "dummy.dat",
      data: createTable(simplePayload.subarray(0, -1)),
      error: /dummy\.dat.*record 0/v,
    },
    {
      name: "nonzero string terminator",
      file: "dummy.dat",
      data: createTable(Buffer.concat([simplePayload.subarray(0, -1), Buffer.from([65])])),
      error: /dummy\.dat.*record 0/v,
    },
    {
      name: "zero opaque string length",
      file: "bgm.dat",
      data: createTable(
        Buffer.concat([
          Buffer.alloc(4),
          emptyString,
          Buffer.alloc(20),
          emptyString,
          Buffer.alloc(16),
          emptyLanguages,
        ]),
      ),
      error: /bgm\.dat.*record 0/v,
    },
    {
      name: "nonzero opaque string terminator",
      file: "bgm.dat",
      data: createTable(
        Buffer.concat([
          Buffer.alloc(4),
          emptyString,
          Buffer.alloc(16),
          Buffer.from([1, 0, 0, 0, 65]),
          emptyString,
          Buffer.alloc(16),
          emptyLanguages,
        ]),
      ),
      error: /bgm\.dat.*record 0/v,
    },
    {
      name: "trailing file bytes",
      file: "dummy.dat",
      data: Buffer.concat([createTable(simplePayload), Buffer.from([1, 2, 3])]),
      error: /dummy\.dat.*trailing bytes/v,
    },
    {
      name: "record count exceeding available records",
      file: "dummy.dat",
      data: createTable(simplePayload, simplePayload.length, 2),
      error: /dummy\.dat.*record 1/v,
    },
    {
      name: "numeric list exceeding its record",
      file: "talk.dat",
      data: createTable(Buffer.concat([Buffer.alloc(4), emptyString, encodeNumber(2)])),
      error: /talk\.dat.*record 0/v,
    },
    {
      name: "command count exceeding its record",
      file: "talk.dat",
      data: createTable(
        Buffer.concat([Buffer.alloc(4), emptyString, Buffer.alloc(8), encodeNumber(1)]),
      ),
      error: /talk\.dat.*record 0/v,
    },
    {
      name: "dialog line count exceeding its record",
      file: "taskList.dat",
      data: createTable(
        Buffer.concat([Buffer.alloc(4), emptyString, Buffer.alloc(8), encodeNumber(1)]),
      ),
      error: /taskList\.dat.*record 0/v,
    },
    {
      name: "option count exceeding its record",
      file: "question.dat",
      data: createTable(
        Buffer.concat([Buffer.alloc(4), emptyString, emptyString, emptyLanguages, encodeNumber(1)]),
      ),
      error: /question\.dat.*record 0/v,
    },
    {
      name: "page count exceeding its record",
      file: "tutorial.dat",
      data: createTable(
        Buffer.concat([
          Buffer.alloc(4),
          emptyString,
          emptyString,
          emptyString,
          Buffer.alloc(4),
          emptyLanguages,
          encodeNumber(1),
        ]),
      ),
      error: /tutorial\.dat.*record 0/v,
    },
  ];

  it.each(invalidFiles)("rejects $name in $file", ({ file, data, error }) => {
    expect.assertions(1);

    expect(() => extract(data, file)).toThrow(error);
  });

  it("labels French and Spanish according to the physical game order", async () => {
    expect.assertions(2);

    const data = await readFile("tests/fixtures/string.dat");
    const records = extract(data, "string.dat");
    const firstRecord = records.at(0)!;
    const [, languages] = firstRecord.find((field): field is TextField => isTextField(field))!;

    expect(languages.fr).toBe("Oui");
    expect(languages.es).toBe("Sí");
  });

  interface ListTestFile extends TestFile {
    counts: number[];
  }

  const listFiles: ListTestFile[] = [
    { file: "cheatSetting.dat", counts: [0, 2] },
    { file: "gameSetting.dat", counts: [0, 2, 3, 4] },
    { file: "question.dat", counts: [2, 14] },
  ];

  it.each(listFiles)("extracts every languagesOptions entry in $file", async ({ file, counts }) => {
    expect.assertions(1);

    const data = await readFile(`tests/fixtures/${file}`);
    const records = extract(data, file);
    const listOffset = payloadsStructures.get(file)!.indexOf("languagesOptions");
    const actualCounts = records.map(
      (record) =>
        record
          .filter((field): field is TextField => isTextField(field))
          .filter(({ 2: offset }) => offset.startsWith(`${listOffset}.`)).length,
    );

    expect([...new Set(actualCounts)].toSorted((left, right) => left - right)).toStrictEqual(
      counts,
    );
  });

  it("preserves the four bytes after each languagesOptions option", async () => {
    expect.assertions(3);

    const data = await readFile("tests/fixtures/question.dat");
    const record = extract(data, "question.dat").at(0)!;
    const firstOptionField = record
      .filter((field): field is TextField => isTextField(field))
      .find(({ 2: offset }) => offset === "4.0")!;
    const firstOption = record.indexOf(firstOptionField);
    const options = record.slice(firstOption);

    expect(record.at(firstOption - 1)).toStrictEqual([4, Buffer.from([2, 0, 0, 0])]);
    expect(options.map(([type]) => type)).toStrictEqual([
      "languages",
      4,
      "languages",
      options.at(-1)!.at(0),
    ]);
    expect(
      options
        .filter((field): field is [number, Buffer] => typeof field.at(0) === "number")
        .map(([, value]) => value.subarray(0, 4)),
    ).toStrictEqual([Buffer.from([1, 0, 0, 0]), Buffer.alloc(4)]);
  });

  it("extracts every tutorial page as a dialog while preserving variable tails", async () => {
    expect.assertions(5);

    const data = await readFile("tests/fixtures/tutorial.dat");
    const records = extract(data, "tutorial.dat");
    const lineCounts = records.flatMap((record) =>
      record
        .filter((field): field is TextField => isTextField(field))
        .filter((field): field is DialogField => field.at(0) === "dialog")
        .map(({ 3: linesCount }) => linesCount),
    );
    const textFields = records.flatMap((record) =>
      record.filter((field): field is TextField => isTextField(field)),
    );
    const tailSizes = records.map((record) => record.at(-1)!.at(0));

    expect(records).toHaveLength(81);
    expect(lineCounts).toHaveLength(176);
    expect(lineCounts).toStrictEqual(Array.from({ length: 176 }, () => 5));
    expect(textFields).toHaveLength(257);
    expect(new Set(tailSizes)).toStrictEqual(new Set([32, 36, 40, 52]));
  });

  it("preserves tutorial page headers and assigns distinct title and dialog references", async () => {
    expect.assertions(2);

    const data = await readFile("tests/fixtures/tutorial.dat");
    const record = extract(data, "tutorial.dat").at(0)!;
    const dialogIndex = record.findIndex(([type]) => type === "dialog");

    expect(record.at(dialogIndex - 1)).toStrictEqual([
      12,
      Buffer.from([1, 0, 0, 0, 169, 0, 0, 0, 0, 0, 0, 0]),
    ]);
    expect(
      record
        .filter((field): field is TextField => isTextField(field))
        .slice(0, 2)
        .map(([type, texts, offset]) => [type, texts.en, offset]),
    ).toStrictEqual([
      ["languages", "Movement and Actions", "5"],
      [
        "dialog",
        [
          "<cmd CMD_UNIT_MOVE_STICK>　<c t_cmd>Move</c>",
          "<cmd CMD_UNIT_ACTION_ATTACK_1>　<c t_cmd>Normal Attack</c>",
          "<cmd CMD_UNIT_ACTION_ATTACK_2>　<c t_cmd>Strong Attack</c>",
          "<space>",
          "<c t_notice>Move</c> and <c t_notice>attack</c> to defeat the incoming enemies.",
        ].join("\n"),
        "6.0",
      ],
    ]);
  });
});
