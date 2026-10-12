import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { Publisher } from "@triforce-heroes/triforce-publisher";

import { extract, LANGUAGES } from "#/Extract";
import { getRecordKey, payloadsStructures } from "#/types/Database";

const publisher = new Publisher(13);

for (const language of LANGUAGES) {
  publisher.addLanguage(language);
}

const files = await readdir("tests/fixtures");

for (const file of files) {
  if (file === "dummy.dat" || !payloadsStructures.has(file)) {
    continue;
  }

  // oxlint-disable-next-line no-await-in-loop
  const data = await readFile(join("tests/fixtures", file));
  const records = extract(data, file);
  const resource = basename(file, ".dat");

  for (const record of records) {
    const recordReference = getRecordKey(record);
    const notes: string[] = [];

    for (const [type, value] of record) {
      if (type === "notes") {
        notes.push(value);
      }
    }

    if (recordReference === undefined) {
      throw new Error(`${file}: missing key or keyId`);
    }

    const recordNotes = notes.join("\n");
    const metadata = recordNotes === "" ? undefined : { notes: recordNotes };

    for (const [type, value, offset] of record) {
      if (type !== "languages" && type !== "dialog") {
        continue;
      }

      if (value.en === "" && value.es === "") {
        continue;
      }

      const reference = `${recordReference}#${offset}`;

      for (const language of LANGUAGES) {
        publisher.addReference(language, resource, reference, value[language], metadata);
      }
    }
  }
}

await publisher.save("tools/resources");
