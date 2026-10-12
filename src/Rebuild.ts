import { BufferBuilder } from "@triforce-heroes/triforce-core";

import { extract } from "#/Extract";
import { getRecordKey, LANGUAGES } from "#/types/Database";

export type {
  DatabaseRecord,
  LanguageTexts,
  PayloadField,
  PayloadStructure,
  TextField,
} from "#/types/Database";

export function rebuild(
  data: Buffer,
  filename: string,
  replacements: ReadonlyMap<string, string>,
): Buffer {
  const dataBuilder = new BufferBuilder();
  const records = extract(data, filename);

  dataBuilder.writeUnsignedInt32(records.length);

  for (const record of records) {
    const recordKey = getRecordKey(record);
    let payloadLength = 0;

    // The builder fills the payload length after all fields have been written.
    dataBuilder.writeUnsignedInt32(() => payloadLength);

    const recordStart = dataBuilder.length;

    for (const [type, value, offset, linesCount, lineSuffixes] of record) {
      if (type === "keyId") {
        dataBuilder.writeUnsignedInt32(value);
      } else if (typeof type === "number") {
        dataBuilder.push(value);
      } else if (type === "languages" || type === "dialog") {
        const replacement =
          recordKey === undefined ? undefined : replacements.get(`${recordKey}#${offset}`);

        if (type === "languages") {
          for (const language of LANGUAGES) {
            const text = language === "en" ? (replacement ?? value.en) : value[language];

            dataBuilder.writeLengthPrefixedString(`${text}\0`);
          }

          continue;
        }

        dataBuilder.writeUnsignedInt32(linesCount);

        const languageLines = LANGUAGES.map((language) => {
          const original = value[language];

          if (language !== "en" || replacement === undefined || replacement === original) {
            return original.split("\n");
          }

          const lines = replacement.replaceAll(/\r\n?/gv, "\n").split("\n");

          // Keep the original capacity; blank or missing translated lines require <space>.
          return Array.from({ length: linesCount }, (_, lineIndex) => {
            const line = lines.at(lineIndex) ?? "";

            return line === "" ? "<space>" : line;
          });
        });

        for (let lineIndex = 0; lineIndex < linesCount; lineIndex++) {
          for (const lines of languageLines) {
            dataBuilder.writeLengthPrefixedString(`${lines.at(lineIndex) ?? ""}\0`);
          }

          const suffix = lineSuffixes?.at(lineIndex);

          if (suffix !== undefined) {
            dataBuilder.push(suffix);
          }
        }
      } else {
        dataBuilder.writeLengthPrefixedString(`${value}\0`);
      }
    }

    payloadLength = dataBuilder.length - recordStart;
  }

  return dataBuilder.build();
}
