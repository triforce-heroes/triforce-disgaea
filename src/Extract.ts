import { BufferConsumer } from "@triforce-heroes/triforce-core";

import {
  LANGUAGES,
  payloadsStructures,
  type DatabaseRecord,
  type LanguageTexts,
} from "#/types/Database";

export {
  LANGUAGES,
  getRecordKey,
  isTextField,
  type Language,
  type LanguageTexts,
  type TextField,
  type PayloadStructure,
  type PayloadField,
  type DatabaseRecord,
} from "#/types/Database";

function preserveBuffer(dataConsumer: BufferConsumer, byteLength: number, record: DatabaseRecord) {
  const end = dataConsumer.byteOffset;

  if (end > dataConsumer.buffer.length) {
    throw new Error("field exceeds record boundary");
  }

  if (byteLength === 0) {
    return;
  }

  const previousLength = record.at(-1)?.at(0);

  // Opaque fields are contiguous in the source, so merging needs no byte copies.
  if (typeof previousLength === "number") {
    const length = previousLength + byteLength;

    record.splice(-1, 1, [length, dataConsumer.buffer.subarray(end - length, end)]);
    return;
  }

  record.push([byteLength, dataConsumer.buffer.subarray(end - byteLength, end)]);
}

function readStringLength(dataConsumer: BufferConsumer): number {
  const stringLength = dataConsumer.readUnsignedInt32();
  const end = dataConsumer.byteOffset + stringLength;

  if (stringLength === 0 || end > dataConsumer.buffer.length) {
    throw new Error("invalid string length");
  }

  if (dataConsumer.buffer.at(end - 1) !== 0) {
    throw new Error("missing string terminator");
  }

  return stringLength;
}

function readString(dataConsumer: BufferConsumer): string {
  const stringLength = readStringLength(dataConsumer);
  const stringContents = dataConsumer.read(stringLength - 1);

  dataConsumer.skip(1);

  return stringContents.toString();
}

function readLanguages(dataConsumer: BufferConsumer): LanguageTexts {
  const texts = {} as LanguageTexts;

  for (const language of LANGUAGES) {
    texts[language] = readString(dataConsumer);
  }

  return texts;
}

function extractDialog(
  dataConsumer: BufferConsumer,
  typeOffset: string,
  record: DatabaseRecord,
  lineSuffixLength = 0,
) {
  const linesCount = dataConsumer.readUnsignedInt32();
  const lines = LANGUAGES.map((): string[] => []);
  const texts = {} as LanguageTexts;
  const lineSuffixes: Buffer[] = [];

  for (let lineIndex = 0; lineIndex < linesCount; lineIndex++) {
    for (const languageLines of lines) {
      const text = readString(dataConsumer);

      // Embedded LF would lose the original slot boundaries when joined and split.
      if (text.includes("\n")) {
        throw new Error("embedded newline in dialog line");
      }

      languageLines.push(text);
    }

    if (lineSuffixLength > 0) {
      dataConsumer.skip(lineSuffixLength);

      if (dataConsumer.byteOffset > dataConsumer.buffer.length) {
        throw new Error("dialog line suffix exceeds record boundary");
      }

      lineSuffixes.push(
        dataConsumer.buffer.subarray(
          dataConsumer.byteOffset - lineSuffixLength,
          dataConsumer.byteOffset,
        ),
      );
    }
  }

  for (const [languageIndex, language] of LANGUAGES.entries()) {
    const languageLines = lines.at(languageIndex)!;

    if (lineSuffixLength > 0) {
      while (languageLines.at(-1) === "") {
        languageLines.pop();
      }
    }

    texts[language] = languageLines.join("\n");
  }

  record.push(
    lineSuffixLength === 0
      ? ["dialog", texts, typeOffset, linesCount]
      : ["dialog", texts, typeOffset, linesCount, lineSuffixes],
  );
}

function extractLanguagesOptions(
  dataConsumer: BufferConsumer,
  typeOffset: string,
  record: DatabaseRecord,
) {
  const count = dataConsumer.readUnsignedInt32();
  preserveBuffer(dataConsumer, 4, record);

  for (let optionIndex = 0; optionIndex < count; optionIndex++) {
    record.push(["languages", readLanguages(dataConsumer), `${typeOffset}.${optionIndex}`]);
    dataConsumer.skip(4);
    preserveBuffer(dataConsumer, 4, record);
  }
}

export function extract(data: Buffer, filename: string): DatabaseRecord[] {
  const payloadStructure = payloadsStructures.get(filename);

  if (payloadStructure === undefined) {
    throw new Error(`${filename}: unsupported table`);
  }

  if (data.length < 4) {
    throw new Error(`${filename}: truncated file header`);
  }

  const dataConsumer = new BufferConsumer(data);
  const recordsCount = dataConsumer.readUnsignedInt32();
  const records: DatabaseRecord[] = [];

  for (let recordIndex = 0; recordIndex < recordsCount; recordIndex++) {
    try {
      const payloadLength = dataConsumer.readUnsignedInt32();

      if (payloadLength > data.length - dataConsumer.byteOffset) {
        throw new Error("record exceeds file boundary");
      }

      const recordConsumer = dataConsumer.consumer(payloadLength);
      const record: DatabaseRecord = [];

      for (const [typeOffset, type] of payloadStructure.entries()) {
        if (type === "keyId") {
          record.push([type, recordConsumer.readUnsignedInt32()]);
        } else if (type === "id" || typeof type === "number") {
          const byteLength = type === "id" ? 4 : type;

          recordConsumer.skip(byteLength);
          preserveBuffer(recordConsumer, byteLength, record);
        } else if (type === "string") {
          const stringLength = readStringLength(recordConsumer);

          recordConsumer.skip(stringLength);
          preserveBuffer(recordConsumer, 4 + stringLength, record);
        } else if (type === "key" || type === "notes") {
          record.push([type, readString(recordConsumer)]);
        } else if (type === "dialog") {
          extractDialog(recordConsumer, String(typeOffset), record);
        } else if (type === "languagesOptions") {
          extractLanguagesOptions(recordConsumer, String(typeOffset), record);
        } else if (type === "uint32List") {
          const count = recordConsumer.readUnsignedInt32();

          recordConsumer.skip(count * 4);
          preserveBuffer(recordConsumer, 4 + count * 4, record);
        } else if (type === "commandsList") {
          const commandsCount = recordConsumer.readUnsignedInt32();

          preserveBuffer(recordConsumer, 4, record);

          for (let commandIndex = 0; commandIndex < commandsCount; commandIndex++) {
            const headerStart = recordConsumer.byteOffset;

            // Command header: opcode, two uint32 lists, two strings, 40 opaque bytes.
            const commandCode = recordConsumer.readUnsignedInt32();

            for (let listIndex = 0; listIndex < 2; listIndex++) {
              recordConsumer.skip(recordConsumer.readUnsignedInt32() * 4);
            }

            for (let stringIndex = 0; stringIndex < 2; stringIndex++) {
              recordConsumer.skip(readStringLength(recordConsumer));
            }

            recordConsumer.skip(40);
            preserveBuffer(recordConsumer, recordConsumer.byteOffset - headerStart, record);
            const commandOffset = `${typeOffset}.${commandIndex}`;

            if (commandCode === 2) {
              extractDialog(recordConsumer, commandOffset, record, 4);
            } else {
              extractLanguagesOptions(recordConsumer, commandOffset, record);
            }
          }
        } else if (type === "pagesList") {
          const pagesCount = recordConsumer.readUnsignedInt32();

          preserveBuffer(recordConsumer, 4, record);

          for (let pageIndex = 0; pageIndex < pagesCount; pageIndex++) {
            recordConsumer.skip(8);
            preserveBuffer(recordConsumer, 8, record);
            extractDialog(recordConsumer, `${typeOffset}.${pageIndex}`, record);
          }
        } else {
          record.push([type, readLanguages(recordConsumer), String(typeOffset)]);
        }
      }

      const tailLength = recordConsumer.buffer.length - recordConsumer.byteOffset;

      recordConsumer.skip(tailLength);
      preserveBuffer(recordConsumer, tailLength, record);

      records.push(record);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      throw new Error(`${filename}: record ${recordIndex}: ${message}`, { cause: error });
    }
  }

  if (!dataConsumer.isConsumed()) {
    throw new Error(`${filename}: trailing bytes after last record`);
  }

  return records;
}
