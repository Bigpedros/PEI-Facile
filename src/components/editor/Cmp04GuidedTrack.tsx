import React, { useState } from 'react';
import type { PeiFieldDefinition } from '../../types/pei';
import { Compass, Check, ArrowRight, RotateCcw, Edit3 } from 'lucide-react';

interface Cmp04GuidedTrackProps {
  field: PeiFieldDefinition;
  value: string;
  onChange: (val: string) => void;
  onFocus?: () => void;
  disabled?: boolean;
}

export const Cmp04GuidedTrack: React.FC<Cmp04GuidedTrackProps> = ({
  field,
  value = '',
  onChange,
  onFocus,
  disabled = false,
}) => {
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const questions = field.guidedQuestions || [];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [activeStep, setActiveStep] = useState(0);
  const [draftPreview, setDraftPreview] = useState('');

  const handleStartWizard = () => {
    setIsWizardOpen(true);
    setActiveStep(0);
    setAnswers({});
    setDraftPreview('');
  };

  const handleSelectOption = (questionId: string, text: string) => {
    const updated = { ...answers, [questionId]: text };
    setAnswers(updated);
    composePreview(updated);
  };

  const composePreview = (ans: Record<string, string>) => {
    const parts = questions
      .map((q) => ans[q.id])
      .filter((a) => Boolean(a && a.trim()));
    setDraftPreview(parts.join('. ') + (parts.length > 0 ? '.' : ''));
  };

  const handleConfirmInsert = () => {
    if (draftPreview.trim()) {
      if (value.trim()) {
        onChange(value.trim() + '\n' + draftPreview.trim());
      } else {
        onChange(draftPreview.trim());
      }
    }
    setIsWizardOpen(false);
  };

  return (
    <div className="w-full space-y-2">
      <div className="relative">
        <textarea
          id={field.id}
          rows={field.minLines || 3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          disabled={disabled}
          placeholder={field.placeholder || 'Scrivi direttamente o avvia la traccia guidata passo-passo...'}
          className="w-full px-3 py-2 text-sm text-stone-900 bg-white border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-800 focus:border-amber-800 disabled:bg-stone-100 disabled:text-stone-400 transition-colors leading-relaxed"
        />
        {questions.length > 0 && !disabled && (
          <button
            type="button"
            onClick={handleStartWizard}
            className="absolute top-2 right-2 inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded shadow-xs transition-colors"
            title="Avvia percorso di domande guidate"
          >
            <Compass className="w-3.5 h-3.5 text-emerald-700" />
            <span>Traccia guidata ({questions.length} passaggi)</span>
          </button>
        )}
      </div>

      {isWizardOpen && (
        <div className="p-3 bg-emerald-50/40 border border-emerald-200 rounded text-xs space-y-3">
          <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-900">
              <Compass className="w-4 h-4 text-emerald-700" />
              <span>Traccia guidata — Passo {activeStep + 1} di {questions.length}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsWizardOpen(false)}
              className="text-stone-500 hover:text-stone-800"
            >
              Annulla
            </button>
          </div>

          {questions[activeStep] && (
            <div className="space-y-2">
              <p className="font-medium text-stone-800 text-sm">
                {questions[activeStep].prompt}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {questions[activeStep].options?.map((opt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSelectOption(questions[activeStep].id, opt)}
                    className={`text-left p-2 rounded border transition-colors ${
                      answers[questions[activeStep].id] === opt
                        ? 'bg-emerald-100 border-emerald-400 font-medium text-emerald-950 shadow-xs'
                        : 'bg-white border-stone-200 hover:border-emerald-300 text-stone-800'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <div className="mt-1">
                <input
                  type="text"
                  placeholder="Oppure scrivi risposta personalizzata..."
                  value={answers[questions[activeStep].id] || ''}
                  onChange={(e) => handleSelectOption(questions[activeStep].id, e.target.value)}
                  className="w-full px-2 py-1 border border-stone-300 rounded bg-white text-xs"
                />
              </div>
            </div>
          )}

          {draftPreview && (
            <div className="p-2 bg-white border border-emerald-100 rounded space-y-1">
              <div className="font-medium text-emerald-900 flex items-center gap-1 text-[11px]">
                <Edit3 className="w-3 h-3" />
                Anteprima del testo generato dalla traccia:
              </div>
              <p className="text-stone-800 italic leading-relaxed text-xs">{draftPreview}</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-1 border-t border-emerald-100">
            <div className="flex items-center gap-2">
              {activeStep > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveStep(activeStep - 1)}
                  className="px-2 py-1 border border-stone-300 rounded bg-white hover:bg-stone-50"
                >
                  Precedente
                </button>
              )}
              {activeStep < questions.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setActiveStep(activeStep + 1)}
                  className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded font-medium inline-flex items-center gap-1"
                >
                  <span>Successivo</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setAnswers({});
                  setDraftPreview('');
                  setActiveStep(0);
                }}
                className="px-2 py-1 text-stone-600 hover:text-stone-900 inline-flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Azzera</span>
              </button>
              <button
                type="button"
                onClick={handleConfirmInsert}
                disabled={!draftPreview.trim()}
                className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 disabled:bg-stone-300 text-white rounded font-medium inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Inserisci nel campo</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
