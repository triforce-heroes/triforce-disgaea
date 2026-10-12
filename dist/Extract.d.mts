import { a as PayloadField, c as getRecordKey, i as LanguageTexts, l as isTextField, n as LANGUAGES, o as PayloadStructure, r as Language, s as TextField, t as DatabaseRecord } from "./Database-CTuQal-T.mjs";
//#region src/Extract.d.ts
export declare function extract(data: Buffer, filename: string): DatabaseRecord[];
//#endregion
export { type DatabaseRecord, LANGUAGES, type Language, type LanguageTexts, type PayloadField, type PayloadStructure, type TextField, getRecordKey, isTextField };