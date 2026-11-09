import { useId, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react';

interface FieldExtras { label: string; hint?: string; error?: string }
export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>, FieldExtras {}
export function TextField({ label, hint, error, id, className = '', ...rest }: TextFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = fieldId + '-hint';
  const errorId = fieldId + '-error';
  return <div className="ui-field">
    <label className="ui-field-label" htmlFor={fieldId}>{label}</label>
    <input {...rest} id={fieldId} className={'ui-input ' + className}
      aria-invalid={Boolean(error) || undefined}
      aria-describedby={error ? errorId : hint ? hintId : undefined}/>
    {error ? <p id={errorId} className="ui-field-error" role="alert">{error}</p> :
      hint ? <p id={hintId} className="ui-field-hint">{hint}</p> : null}
  </div>;
}
export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement>, FieldExtras {
  options: ReadonlyArray<{ value: string; label: string }>;
}
export function SelectField({ label, hint, error, options, id, className = '', ...rest }: SelectFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = fieldId + '-error';
  const hintId = fieldId + '-hint';
  return <div className="ui-field">
    <label className="ui-field-label" htmlFor={fieldId}>{label}</label>
    <select {...rest} id={fieldId} className={'ui-input ' + className}
      aria-invalid={Boolean(error) || undefined}
      aria-describedby={error ? errorId : hint ? hintId : undefined}>
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    {error ? <p id={errorId} className="ui-field-error" role="alert">{error}</p> :
      hint ? <p id={hintId} className="ui-field-hint">{hint}</p> : null}
  </div>;
}
