import { z } from "zod";

// Mirrors the backend limits: 1–20 questions, 2–10 options, unique option text per question.
export const optionSchema = z.object({ text: z.string().trim().min(1, "Write the option").max(200) });

export const questionSchema = z
  .object({
    text: z.string().trim().min(1, "Write the question").max(500),
    type: z.enum(["single", "multiple"]),
    options: z.array(optionSchema).min(2, "Add at least two options").max(10, "Use ten options or fewer"),
  })
  .superRefine((q, ctx) => {
    const seen = new Map<string, number>();
    q.options.forEach((o, i) => {
      const key = o.text.trim().toLowerCase();
      if (!key) return;
      if (seen.has(key)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["options", i, "text"], message: "This option is already listed" });
      } else seen.set(key, i);
    });
  });

export const surveySchema = z.object({
  title: z.string().trim().min(3, "Use at least 3 characters").max(200),
  description: z.string().max(2000),
  questions: z.array(questionSchema).min(1, "Add at least one question").max(20, "Use 20 questions or fewer"),
});

export type SurveyForm = z.infer<typeof surveySchema>;

export const emptyQuestion = (): SurveyForm["questions"][number] => ({
  text: "",
  type: "multiple",
  options: [{ text: "" }, { text: "" }],
});
