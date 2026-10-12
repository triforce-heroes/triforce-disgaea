import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { extract } from "#/Extract";
import { rebuild } from "#/Rebuild";
import { getRecordKey, isTextField, payloadsStructures } from "#/types/Database";

describe(rebuild, () => {
  interface TestFile {
    file: string;
  }

  const testFiles: TestFile[] = payloadsStructures
    .keys()
    .map((file) => ({ file }))
    .toArray();

  it.each(testFiles)("rebuild $file", async ({ file }) => {
    expect.assertions(1);

    const data = await readFile(`tests/fixtures/${file}`);
    const rebuilded = rebuild(data, file, new Map());

    expect(rebuilded.equals(data)).toBe(true);
  });

  it("rebuilds dummy.dat with replacements", async () => {
    expect.assertions(1);

    const data = await readFile(`tests/fixtures/dummy.dat`);
    const rebuildReplacement = rebuild(
      data,
      "dummy.dat",
      new Map([["DUMMY_00#2", "Replaced! Ação! 🎉"]]),
    );

    await expect(extract(rebuildReplacement, "dummy.dat")).toMatchFileSnapshot(
      `snaps/dummy.dat.rebuilded.snap`,
    );
  });

  const replacementFiles: TestFile[] = [
    { file: "framework_vkey.dat" },
    { file: "vkey.dat" },
    { file: "randomName.dat" },
    { file: "item.dat" },
    { file: "modelSequenceType.dat" },
  ];

  it.each(replacementFiles)(
    "resolves the record reference before rebuilding $file",
    async ({ file }) => {
      expect.assertions(1);

      const data = await readFile(`tests/fixtures/${file}`);
      const expectedRecords = extract(data, file);
      const record = expectedRecords.at(0)!;
      const key = getRecordKey(record)!;
      const [, texts, offset] = record
        .filter((field) => isTextField(field))
        .find(([type]) => type === "languages")!;
      const text = "Tradução: ação, coração e bênção.";
      const rebuilt = rebuild(data, file, new Map([[`${key}#${offset}`, text]]));

      texts.en = text;

      expect(extract(rebuilt, file)).toStrictEqual(expectedRecords);
    },
  );

  const listFiles: TestFile[] = [
    { file: "act.dat" },
    { file: "act_Enemy.dat" },
    { file: "area.dat" },
    { file: "characterWorld_Act.dat" },
    { file: "characterWorld_CellType.dat" },
    { file: "characterWorld_EventType.dat" },
    { file: "characterWorld_Rewards.dat" },
    { file: "characterZukan.dat" },
    { file: "cheatSetting.dat" },
    { file: "DLC_delivery.dat" },
    { file: "evility.dat" },
    { file: "gameSetting.dat" },
    { file: "innocent.dat" },
    { file: "item.dat" },
    { file: "itemWorldRewards.dat" },
    { file: "notice.dat" },
    { file: "question.dat" },
    { file: "taskList.dat" },
    { file: "trophy.dat" },
    { file: "tutorial.dat" },
    { file: "wish.dat" },
  ];

  it.each(listFiles)("replaces every English block independently in $file", async ({ file }) => {
    expect.assertions(1);

    const data = await readFile(`tests/fixtures/${file}`);
    const expectedRecords = extract(data, file);
    const replacements = new Map<string, string>();

    for (const [recordIndex, record] of expectedRecords.entries()) {
      const key = getRecordKey(record)!;

      for (const [, texts, offset] of record.filter((field) => isTextField(field))) {
        const text = texts.en
          .split("\n")
          .map(
            (_, lineIndex) =>
              `Tradução ${recordIndex}#${offset}:${lineIndex}: ação, coração e bênção.`,
          )
          .join("\n");

        replacements.set(`${key}#${offset}`, text);
        texts.en = text;
      }
    }

    const rebuilt = rebuild(data, file, replacements);

    expect(extract(rebuilt, file)).toStrictEqual(expectedRecords);
  });
});
