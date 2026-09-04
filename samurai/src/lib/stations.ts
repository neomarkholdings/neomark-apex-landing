export const BLADE_STATIONS = [
  "protection",
  "amoeba",
  "gate",
  "resident",
  "windows",
  "privacy",
] as const;

export type BladeStation = (typeof BLADE_STATIONS)[number];

export type StationSpec = {
  id: BladeStation;
  title: string;
  kana: string;
  mark: string;
};

export const STATION_SPECS: readonly StationSpec[] = [
  { id: "protection", title: "PROTECTION", kana: "防御", mark: "刃" },
  { id: "amoeba", title: "AMOEBA", kana: "修復", mark: "復" },
  { id: "gate", title: "INSTALL GATE", kana: "門", mark: "門" },
  { id: "resident", title: "RESIDENT", kana: "常駐", mark: "座" },
  { id: "windows", title: "WINDOWS LINE", kana: "窓", mark: "窓" },
  { id: "privacy", title: "PRIVACY", kana: "遮蔽", mark: "隠" },
];
