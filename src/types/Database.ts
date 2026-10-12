export const LANGUAGES = ["jp", "en", "fr", "es", "zh-TW", "ko"] as const;

export type Language = (typeof LANGUAGES)[number];

export type LanguageTexts = Record<Language, string>;

export type TextField =
  | [type: "languages", value: LanguageTexts, offset: string]
  | [
      type: "dialog",
      value: LanguageTexts,
      offset: string,
      linesCount: number,
      lineSuffixes?: Buffer[],
    ];

export type PayloadStructureString = "key" | "notes" | "string";

export type PayloadStructure =
  | "id"
  | "keyId"
  | PayloadStructureString
  | "dialog"
  | "languagesOptions"
  | "pagesList"
  | "uint32List"
  | "commandsList"
  | "languages"
  | number;

export type PayloadField =
  | [type: "keyId", value: number]
  | [type: "key" | "notes", value: string]
  | TextField
  | [type: number, value: Buffer];

export type DatabaseRecord = PayloadField[];

export function isTextField(field: PayloadField): field is TextField {
  const type = field.at(0);

  return type === "languages" || type === "dialog";
}

export function getRecordKey(record: DatabaseRecord): string | number | undefined {
  for (const [type, value] of record) {
    if (type === "key" || type === "keyId") {
      return value;
    }
  }

  return undefined;
}

export const payloadsStructures: ReadonlyMap<string, readonly PayloadStructure[]> = new Map([
  ["dummy.dat", ["id", "key", "languages"]],
  //
  ["act.dat", ["id", "key", 4, "notes", "languages", "dialog"]],
  ["act_Enemy.dat", ["id", "key", 4, "notes", "languages", "dialog"]],
  ["area.dat", ["id", "key", "languages", "dialog"]],
  ["bgm.dat", ["id", "key", 16, "string", "string", 16, "languages"]],
  ["character.dat", ["id", "key", 4, "languages", 4, "languages"]],
  [
    "characterWorld_Act.dat",
    ["id", "key", "notes", "notes", "languages", "dialog", "dialog", "languages"],
  ],
  ["characterWorld_BattleLog.dat", ["id", "key", "notes", "languages"]],
  ["characterWorld_CellType.dat", ["id", "key", "notes", 28, "dialog"]],
  ["characterWorld_Character.dat", ["id", "key", "notes", "notes", 4, "languages", "languages"]],
  ["characterWorld_Difficulty.dat", ["id", "key", 4, "languages"]],
  ["characterWorld_EventType.dat", ["id", "key", "notes", "dialog"]],
  ["characterWorld_Rewards.dat", ["id", "key", "notes", "dialog", "dialog"]],
  ["characterZukan.dat", ["id", "key", 4, "languages", "dialog"]],
  [
    "cheatSetting.dat",
    ["id", 8, "key", "languages", "languages", "dialog", 20, "languagesOptions"],
  ],
  ["cmd.dat", ["id", "key", 8, "languages"]],
  ["demoCharacter.dat", ["id", "key", "languages"]],
  ["DLC_delivery.dat", ["id", "key", 12, "languages", "dialog", "dialog"]],
  ["eventViewer.dat", ["id", "key", 12, "languages"]],
  ["evility.dat", ["id", "key", 4, "languages", "languages", "languages", "dialog"]],
  ["framework_cmd.dat", ["id", "key", 8, "languages"]],
  ["framework_string.dat", ["id", "key", "languages"]],
  ["framework_vkey.dat", ["keyId", 8, "languages"]],
  ["framework_vkeyCategory.dat", ["id", "key", "notes", 4, "languages"]],
  ["gameSetting.dat", ["id", "key", 42, "languages", "dialog", "languagesOptions"]],
  ["innocent.dat", ["id", "key", "notes", "languages", "dialog"]],
  ["item.dat", ["id", 4, "languages", "key", 4, "notes", "languages", "dialog", "dialog"]],
  ["itemStrengthen.dat", ["id", "key", "languages", "languages", "languages"]],
  ["itemType.dat", ["id", "key", "notes", "languages"]],
  ["itemWorldRewards.dat", ["id", "key", "notes", "languages", "dialog"]],
  ["mission.dat", ["id", "key", "notes", "languages", "languages"]],
  ["missionList.dat", ["id", "key", "notes", "notes", "languages", "languages"]],
  ["modelSequenceType.dat", ["id", "key", "notes", "languages"]],
  ["musicZukan.dat", ["id", "key", 8, "languages", "languages"]],
  ["nonPlayerCharacter.dat", ["id", "key", "notes", 12, "languages"]],
  ["notice.dat", ["id", "key", 8, "dialog"]],
  ["question.dat", ["id", "key", "notes", "languages", "languagesOptions"]],
  ["randomName.dat", ["keyId", 4, "languages"]],
  ["record.dat", ["id", "key", "languages"]],
  ["senator.dat", ["id", "key", "languages", 4, "languages"]],
  ["stage.dat", ["id", "key", "notes", 12, "languages"]],
  ["string.dat", ["id", "key", "languages"]],
  ["talk.dat", ["id", "key", "uint32List", "uint32List", "commandsList"]],
  ["taskList.dat", ["id", "key", 8, "dialog"]],
  ["trophy.dat", ["id", "key", 16, "languages", 8, "dialog"]],
  ["tutorial.dat", ["id", "key", "notes", "notes", 4, "languages", "pagesList"]],
  ["vkey.dat", ["keyId", 8, "languages"]],
  ["vkeyCategory.dat", ["id", "key", "notes", 4, "languages"]],
  ["wish.dat", ["id", 4, "key", "notes", "languages", "dialog"]],
]);
