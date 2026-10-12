import { Publisher } from "@triforce-heroes/triforce-publisher";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LANGUAGES } from "#/types/Database";

describe("watch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("publishes supported tables without duplicate references and skips empty English and Spanish", async () => {
    expect.assertions(18);

    const save = vi.spyOn(Publisher.prototype, "save").mockResolvedValue(undefined);

    await import("../tools/watch");

    const publisher = save.mock.contexts.at(0) as Publisher;
    const entries = publisher.getEntries();
    const references = entries.map((entry) => `${entry.resource}/${entry.reference}`);
    const expectedLanguages = [...LANGUAGES].toSorted().join(",");

    expect(references).not.toContain("act_Enemy/ACT_ID_ENEMY_BASE#4");
    expect(references).toStrictEqual(
      expect.arrayContaining([
        "framework_vkey/235#2",
        "characterWorld_EventType/CHARACTER_WORLD_EVENT_TYPE_STATUS_UP#3",
        "tutorial/TUTORIAL_005_0003_01#5",
        "tutorial/TUTORIAL_005_0003_01#6.0",
        "tutorial/TUTORIAL_005_0003_01#6.1",
        "tutorial/TUTORIAL_005_0003_01#6.10",
        "talk/TALK_ID_0001_001_10#4.2",
        "modelSequenceType/MODEL_SEQ_STAND#3",
      ]),
    );

    const tutorial = entries.filter((entry) => entry.resource === "tutorial");
    const page = tutorial.find((entry) => entry.reference === "TUTORIAL_002_0003_01#6.0")!;

    expect(tutorial).toHaveLength(257);
    expect(
      Object.keys(page.sources).find((text) => page.sources[text]?.includes("en") === true),
    ).toContain("\n<space>\n");

    const talk = entries
      .filter((entry) => entry.resource === "talk")
      .find((entry) => entry.reference === "TALK_ID_0001_001_10#4.2")!;

    expect(new Set(references).size).toBe(references.length);
    expect(talk.sources["Welcome to Super Duper, N.A.! Thank you for coming!"]).toContain("en");
    expect(references).not.toContain("talk/TALK_ID_0000_000_01#4.1");
    expect(references).not.toContain("talk/TALK_ID_0011_002_19#4.2.0");
    expect(references).not.toContain("talk/TALK_ID_0011_002_19#4.2.1");
    const continuation = entries
      .filter((entry) => entry.resource === "talk")
      .find((entry) => entry.reference === "TALK_ID_0011_002_19#4.2")!;

    expect(
      continuation.sources[
        "That so, huh? Then you'd better hurry up so you can get\nsome practice in."
      ],
    ).toContain("en");
    expect(entries.filter((entry) => entry.resource === "modelSequenceType")).toHaveLength(15);
    expect(references).not.toContain("modelSequenceType/MODEL_SEQ_FALL_DOWN#3");

    expect(entries).toHaveLength(16_534);
    expect(
      entries.every(
        (entry) => Object.values(entry.sources).flat().toSorted().join(",") === expectedLanguages,
      ),
    ).toBe(true);
    expect(
      entries.every((entry) =>
        Object.entries(entry.sources)
          .filter(([text]) => text !== "")
          .some(([, languages]) => languages.some((language) => ["en", "es"].includes(language))),
      ),
    ).toBe(true);
    expect(
      entries
        .filter((entry) => entry.resource === "item")
        .find((entry) => entry.reference === "ITEM_01_01_0001_0#2"),
    ).toStrictEqual({
      resource: "item",
      reference: "ITEM_01_01_0001_0#2",
      sources: {
        かんだガム: ["jp"],
        "ABC Gum": ["en"],
        "Chewing-gum usagé": ["fr"],
        "Chicle masticado": ["es"],
        咬過的口香糖: ["zh-TW"],
        "씹다 만 껌": ["ko"],
      },
      metadata: { notes: "消耗品_回復1" },
    });
    expect(page.metadata).toStrictEqual({
      notes: "ヘルプ_拠点_ローゼンクイーン商会\nローゼンクイーン商会",
    });
    expect(
      entries
        .filter((entry) => entry.resource === "musicZukan")
        .find((entry) => entry.reference === "MUSIC_ZUKAN_RANDOM#3")?.sources,
    ).toStrictEqual({
      ランダム: ["jp"],
      "": ["en"],
      Aléatoire: ["fr"],
      Aleatorio: ["es"],
      隨機: ["zh-TW"],
      랜덤: ["ko"],
    });
  });
});
