//#region src/types/Database.d.ts
declare const LANGUAGES: readonly ["jp", "en", "fr", "es", "zh-TW", "ko"];
type Language = (typeof LANGUAGES)[number];
type LanguageTexts = Record<Language, string>;
type TextField = [type: "languages", value: LanguageTexts, offset: string] | [type: "dialog", value: LanguageTexts, offset: string, linesCount: number, lineSuffixes?: Buffer[]];
type PayloadStructureString = "key" | "notes" | "string";
type PayloadStructure = "id" | "keyId" | PayloadStructureString | "dialog" | "languagesOptions" | "pagesList" | "uint32List" | "commandsList" | "languages" | number;
type PayloadField = [type: "keyId", value: number] | [type: "key" | "notes", value: string] | TextField | [type: number, value: Buffer];
type DatabaseRecord = PayloadField[];
declare function isTextField(field: PayloadField): field is TextField;
declare function getRecordKey(record: DatabaseRecord): string | number | undefined;
//#endregion
export { PayloadField as a, getRecordKey as c, LanguageTexts as i, isTextField as l, LANGUAGES as n, PayloadStructure as o, Language as r, TextField as s, DatabaseRecord as t };