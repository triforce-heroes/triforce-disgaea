import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { extract } from "#/Extract";
import { isTextField, LANGUAGES, payloadsStructures, type TextField } from "#/types/Database";

type DialogField = Extract<TextField, [type: "dialog", ...values: unknown[]]>;

describe("opaque fields", () => {
  const files = payloadsStructures
    .keys()
    .map((file) => ({ file }))
    .toArray();

  it.each(files)(
    "keeps only translation metadata and merges adjacent buffers in $file",
    async ({ file }) => {
      expect.assertions(11);

      const data = await readFile(`tests/fixtures/${file}`);
      const records = extract(data, file);
      const readableTypes = new Set<string>(["key", "keyId", "notes", "languages", "dialog"]);
      const fields = records.flat();
      const readable = fields.filter(([type]) => typeof type === "string");
      const buffers = fields.filter(
        (field): field is [number, Buffer] => typeof field.at(0) === "number",
      );
      const textFields = fields.filter((field): field is TextField => isTextField(field));
      const lineCounts = textFields
        .filter((field): field is DialogField => field.at(0) === "dialog")
        .map(({ 3: linesCount }) => linesCount);
      const adjacentTypes = records.flatMap((record) =>
        record.map(([type], index) => [typeof type, typeof record.at(index + 1)?.at(0)]),
      );

      expect(readable.every(([type]) => readableTypes.has(String(type)))).toBe(true);
      expect(buffers.map(([length]) => length)).toStrictEqual(
        buffers.map(([, value]) => value.length),
      );
      expect(buffers.every(([, value]) => value.length > 0)).toBe(true);
      expect(adjacentTypes).not.toContainEqual(["number", "number"]);
      expect(buffers.every(([, value]) => value.buffer === data.buffer)).toBe(true);
      expect(textFields.map(([, texts]) => Object.keys(texts).toSorted())).toStrictEqual(
        textFields.map(() => [...LANGUAGES].toSorted()),
      );
      expect(
        textFields.map(([, texts]) => Object.values(texts).map((value) => typeof value)),
      ).toStrictEqual(
        textFields.map(() => Array.from({ length: LANGUAGES.length }, () => "string")),
      );
      expect(textFields.every(({ 2: offset }) => /^\d+(?:\.\d+)*$/v.test(offset))).toBe(true);
      expect(lineCounts.every((linesCount) => Number.isInteger(linesCount))).toBe(true);
      expect(lineCounts.every((linesCount) => linesCount >= 0)).toBe(true);
      expect(
        records.every((record) => {
          const offsets = record
            .filter((field): field is TextField => isTextField(field))
            .map(({ 2: offset }) => offset);

          return new Set(offsets).size === offsets.length;
        }),
      ).toBe(true);
    },
  );

  it("preserves the original id bytes while retaining notes and keys", async () => {
    expect.assertions(3);

    const data = await readFile("tests/fixtures/tutorial.dat");
    const record = extract(data, "tutorial.dat").at(0)!;

    expect(record.at(0)).toStrictEqual([4, data.subarray(8, 12)]);
    expect(record.find(([type]) => type === "key")).toStrictEqual(["key", "TUTORIAL_001_0001_01"]);
    expect(record.filter(([type]) => type === "notes")).toHaveLength(2);
  });
});
