import React from 'react';
import type { PeiFieldDefinition, PeiDocument, FieldStatus } from '../../types/pei';
import { FieldStatusIndicator } from './FieldStatusIndicator';
import { Cmp01ShortText } from './Cmp01ShortText';
import { Cmp02LongText } from './Cmp02LongText';
import { Cmp03AssistedText } from './Cmp03AssistedText';
import { Cmp04GuidedTrack } from './Cmp04GuidedTrack';
import { Cmp05SingleChoice } from './Cmp05SingleChoice';
import { Cmp06MultipleChoice } from './Cmp06MultipleChoice';
import { Cmp07NumericField } from './Cmp07NumericField';
import { Cmp08DateOrPeriod } from './Cmp08DateOrPeriod';
import { Cmp09RepeatableTable } from './Cmp09RepeatableTable';
import { Cmp10CalculatedSummary } from './Cmp10CalculatedSummary';
import { HelpCircle } from 'lucide-react';

interface FieldRendererProps {
  field: PeiFieldDefinition;
  document: PeiDocument;
  onFieldValueChange: (fieldId: string, value: any) => void;
  onFieldFocus?: (field: PeiFieldDefinition) => void;
  isActive?: boolean;
}

export const FieldRenderer: React.FC<FieldRendererProps> = ({
  field,
  document,
  onFieldValueChange,
  onFieldFocus,
  isActive = false,
}) => {
  const value = document.values[field.id];
  const status: FieldStatus = isActive
    ? 'attivo'
    : document.fieldStatuses[field.id] || (field.required && !value ? 'obbligatorio_mancante' : 'vuoto');

  const handleChange = (newVal: any) => {
    onFieldValueChange(field.id, newVal);
  };

  const handleFocus = () => {
    if (onFieldFocus) {
      onFieldFocus(field);
    }
  };

  const renderComponent = () => {
    switch (field.componentType) {
      case 'CMP-01':
        return (
          <Cmp01ShortText
            field={field}
            value={value || ''}
            onChange={handleChange}
            onFocus={handleFocus}
          />
        );
      case 'CMP-02':
        return (
          <Cmp02LongText
            field={field}
            value={value || ''}
            onChange={handleChange}
            onFocus={handleFocus}
          />
        );
      case 'CMP-03':
        return (
          <Cmp03AssistedText
            field={field}
            value={value || ''}
            onChange={handleChange}
            onFocus={handleFocus}
          />
        );
      case 'CMP-04':
        return (
          <Cmp04GuidedTrack
            field={field}
            value={value || ''}
            onChange={handleChange}
            onFocus={handleFocus}
          />
        );
      case 'CMP-05':
        return (
          <Cmp05SingleChoice
            field={field}
            value={value || ''}
            onChange={handleChange}
            onFocus={handleFocus}
          />
        );
      case 'CMP-06':
        return (
          <Cmp06MultipleChoice
            field={field}
            value={value || []}
            onChange={handleChange}
            onFocus={handleFocus}
          />
        );
      case 'CMP-07':
        return (
          <Cmp07NumericField
            field={field}
            value={value ?? ''}
            onChange={handleChange}
            onFocus={handleFocus}
          />
        );
      case 'CMP-08':
        return (
          <Cmp08DateOrPeriod
            field={field}
            value={value || ''}
            onChange={handleChange}
            onFocus={handleFocus}
          />
        );
      case 'CMP-09':
        return (
          <Cmp09RepeatableTable
            field={field}
            value={value || []}
            onChange={handleChange}
            onFocus={handleFocus}
          />
        );
      case 'CMP-10':
        return <Cmp10CalculatedSummary field={field} document={document} />;
      default:
        return (
          <Cmp01ShortText
            field={field}
            value={value || ''}
            onChange={handleChange}
            onFocus={handleFocus}
          />
        );
    }
  };

  return (
    <div
      id={`field-container-${field.id}`}
      className={`p-3.5 rounded transition-all duration-150 ${
        isActive
          ? 'bg-amber-50/40 border-l-4 border-l-amber-800 border-t border-r border-b border-amber-200/80 shadow-xs'
          : 'bg-white hover:bg-stone-50/50 border border-stone-200/90'
      }`}
    >
      {/* Header with Label and Status */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <label
          htmlFor={field.id}
          className="text-xs font-bold text-stone-800 flex items-center gap-1.5 cursor-pointer"
          onClick={handleFocus}
        >
          <span>{field.label}</span>
          {field.required && (
            <span className="text-rose-600 font-bold text-sm" title="Campo obbligatorio">
              *
            </span>
          )}
        </label>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-mono text-stone-400 bg-stone-100 px-1 py-0.5 rounded">
            {field.componentType}
          </span>
          <FieldStatusIndicator status={status} required={field.required} />
        </div>
      </div>

      {/* Component Input Element */}
      <div className="mt-1">{renderComponent()}</div>

      {/* Help text & Legal Reference */}
      {(field.helpText || field.legalReference) && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-stone-500">
          <HelpCircle className="w-3.5 h-3.5 text-stone-400 shrink-0" />
          <span>{field.helpText || field.legalReference}</span>
        </div>
      )}
    </div>
  );
};
