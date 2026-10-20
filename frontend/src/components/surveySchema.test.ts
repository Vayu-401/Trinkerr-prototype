import { surveySchema } from "./surveySchema";

const valid = {
  title: "Where will you invest?",
  description: "",
  questions: [{ text: "Asset classes", type: "multiple" as const, options: [{ text: "Equity" }, { text: "Gold" }] }],
};

describe("surveySchema", () => {
  it("accepts a valid survey", () => {
    expect(surveySchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a question with one option", () => {
    const bad = { ...valid, questions: [{ ...valid.questions[0], options: [{ text: "Only" }] }] };
    expect(surveySchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate options ignoring case and spaces", () => {
    const bad = { ...valid, questions: [{ ...valid.questions[0], options: [{ text: "Gold" }, { text: " gold " }] }] };
    const r = surveySchema.safeParse(bad);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(["questions", 0, "options", 1, "text"]);
  });

  it("rejects more than 20 questions and empty surveys", () => {
    expect(surveySchema.safeParse({ ...valid, questions: [] }).success).toBe(false);
    expect(surveySchema.safeParse({ ...valid, questions: Array(21).fill(valid.questions[0]) }).success).toBe(false);
  });

  it("rejects short titles", () => {
    expect(surveySchema.safeParse({ ...valid, title: "ab" }).success).toBe(false);
  });
});
