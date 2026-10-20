import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm, type Control, type UseFormRegister, type FieldErrors } from "react-hook-form";
import { emptyQuestion, surveySchema, type SurveyForm } from "./surveySchema";

interface Props {
  initial?: SurveyForm;
  busy?: boolean;
  onSave: (values: SurveyForm, publish: boolean) => void;
}

export default function SurveyBuilder({ initial, busy, onSave }: Props) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SurveyForm>({
    resolver: zodResolver(surveySchema),
    defaultValues: initial ?? { title: "", description: "", questions: [emptyQuestion()] },
  });
  const questions = useFieldArray({ control, name: "questions" });

  return (
    <form className="space-y-8" noValidate onSubmit={(e) => e.preventDefault()}>
      <section className="space-y-4">
        <div>
          <label className="label" htmlFor="title">Survey title</label>
          <input id="title" className="input text-lg font-semibold" placeholder="Where will you invest next quarter?" {...register("title")} />
          {errors.title && <p className="field-error">{errors.title.message}</p>}
        </div>
        <div>
          <label className="label" htmlFor="description">Description (optional)</label>
          <textarea id="description" className="input min-h-20" placeholder="Tell investors what you're trying to learn." {...register("description")} />
        </div>
      </section>

      <ol className="space-y-6">
        {questions.fields.map((field, qi) => (
          <QuestionEditor
            key={field.id}
            index={qi}
            control={control}
            register={register}
            errors={errors}
            canRemove={questions.fields.length > 1}
            onRemove={() => questions.remove(qi)}
          />
        ))}
      </ol>
      {errors.questions?.message && <p className="field-error">{errors.questions.message}</p>}

      <button
        type="button"
        className="btn-secondary w-full border-dashed"
        disabled={questions.fields.length >= 20}
        onClick={() => questions.append(emptyQuestion())}
      >
        Add a question {questions.fields.length >= 20 && "(limit reached)"}
      </button>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-paper/95 px-4 py-4 backdrop-blur">
        <button type="button" className="btn-primary" disabled={busy} onClick={handleSubmit((v) => onSave(v, true))}>
          Publish survey
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={handleSubmit((v) => onSave(v, false))}>
          Save draft
        </button>
        <span className="text-sm text-muted">Published surveys can't be edited, only closed.</span>
      </div>
    </form>
  );
}

function QuestionEditor({
  index,
  control,
  register,
  errors,
  canRemove,
  onRemove,
}: {
  index: number;
  control: Control<SurveyForm>;
  register: UseFormRegister<SurveyForm>;
  errors: FieldErrors<SurveyForm>;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const options = useFieldArray({ control, name: `questions.${index}.options` });
  const qErr = errors.questions?.[index];

  return (
    <li className="panel p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="num mt-2 text-sm font-semibold text-muted">Q{index + 1}</span>
        <div className="flex-1">
          <label className="sr-only" htmlFor={`q-${index}`}>Question {index + 1}</label>
          <input id={`q-${index}`} className="input font-medium" placeholder="Ask a question" {...register(`questions.${index}.text`)} />
          {qErr?.text && <p className="field-error">{qErr.text.message}</p>}
        </div>
        {canRemove && (
          <button type="button" className="btn-link mt-2 text-brick decoration-brick/40" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>

      <fieldset className="mt-4 pl-8">
        <legend className="label">Investors can pick</legend>
        <div className="flex gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input type="radio" value="single" {...register(`questions.${index}.type`)} /> One option
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="radio" value="multiple" {...register(`questions.${index}.type`)} /> Any number of options
          </label>
        </div>
      </fieldset>

      <div className="mt-4 space-y-2 pl-8">
        {options.fields.map((o, oi) => (
          <div key={o.id}>
            <div className="flex gap-2">
              <label className="sr-only" htmlFor={`q-${index}-o-${oi}`}>Option {oi + 1}</label>
              <input id={`q-${index}-o-${oi}`} className="input" placeholder={`Option ${oi + 1}`} {...register(`questions.${index}.options.${oi}.text`)} />
              <button
                type="button"
                className="btn-secondary px-3"
                aria-label={`Remove option ${oi + 1}`}
                disabled={options.fields.length <= 2}
                onClick={() => options.remove(oi)}
              >
                ✕
              </button>
            </div>
            {qErr?.options?.[oi]?.text && <p className="field-error">{qErr.options[oi]!.text!.message}</p>}
          </div>
        ))}
        {qErr?.options?.message && <p className="field-error">{qErr.options.message}</p>}
        <button
          type="button"
          className="btn-link"
          disabled={options.fields.length >= 10}
          onClick={() => options.append({ text: "" })}
        >
          {options.fields.length >= 10 ? "Ten options is the limit" : "Add an option"}
        </button>
      </div>
    </li>
  );
}
