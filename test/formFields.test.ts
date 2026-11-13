import { describe, it, expect } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormField, FormSection } from '../src/frontend/ui/FormField';
import { Input } from '../src/frontend/ui/Input';
import { Textarea } from '../src/frontend/ui/Textarea';
import { Select } from '../src/frontend/ui/Select';
import { SearchInput } from '../src/frontend/ui/SearchInput';
import { Checkbox, CheckboxGroup, toggleChoice } from '../src/frontend/ui/Checkbox';
import { RadioGroup } from '../src/frontend/ui/RadioGroup';
import { SegmentedControl, nextSegment, tabbableSegment } from '../src/frontend/ui/SegmentedControl';
import { fieldClassName, joinIds, resolveFieldControl } from '../src/frontend/ui/field';

// Locker getippt: Komponenten mit Pflicht-`children` bekommen sie als drittes Argument.
const h = createElement as unknown as (type: unknown, props?: unknown, ...children: unknown[]) => ReactElement;
const html = (el: ReactElement) => renderToStaticMarkup(el);

describe('field', () => {
  it('fieldClassName färbt nur im Fehlerfall rot', () => {
    expect(fieldClassName()).toContain('border-[var(--color-border)]');
    expect(fieldClassName(true)).toContain('border-[var(--color-danger)]');
    expect(fieldClassName(true)).not.toContain('border-[var(--color-border)]');
  });

  it('joinIds lässt Leeres weg', () => {
    expect(joinIds('a', undefined, '', 'b')).toBe('a b');
    expect(joinIds(undefined, false)).toBeUndefined();
  });

  it('resolveFieldControl: eigene Props gewinnen, describedby wird zusammengeführt', () => {
    const ctx = { id: 'f', labelId: 'f-label', describedBy: 'f-hint', invalid: true, required: true, disabled: false };
    expect(resolveFieldControl({}, ctx)).toEqual({
      id: 'f', required: true, disabled: undefined, 'aria-describedby': 'f-hint', 'aria-invalid': true,
    });
    expect(resolveFieldControl({ id: 'own', invalid: false, 'aria-describedby': 'x' }, ctx)).toMatchObject({
      id: 'own', 'aria-describedby': 'x f-hint', 'aria-invalid': undefined,
    });
    expect(resolveFieldControl({}, null)).toEqual({
      id: undefined, required: undefined, disabled: undefined, 'aria-describedby': undefined, 'aria-invalid': undefined,
    });
  });
});

describe('FormField', () => {
  it('verknüpft Beschriftung, Hinweis und Fehler mit dem Input', () => {
    const out = html(h(FormField, { id: 'mail', label: 'E-Mail', hint: 'Für Mails', error: 'Pflichtfeld', required: true }, h(Input, {})));
    expect(out).toContain('for="mail"');
    expect(out).toContain('id="mail"');
    expect(out).toContain('aria-describedby="mail-hint mail-error"');
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain('required=""');
    expect(out).toContain('id="mail-error"');
    expect(out).toContain('signal-text-danger');
  });

  it('ohne Fehler kein aria-invalid, ohne Hinweis kein describedby', () => {
    const out = html(h(FormField, { id: 'n', label: 'Name' }, h(Input, {})));
    expect(out).not.toContain('aria-invalid');
    expect(out).not.toContain('aria-describedby');
  });

  it('as="group" benennt die Gruppe statt ein Feld', () => {
    const out = html(
      h(FormField, { id: 'v', label: 'Sichtbarkeit', as: 'group' },
        h(RadioGroup, { options: [{ value: 'a', label: 'Alle' }], value: 'a', onValueChange: () => {} })),
    );
    expect(out).not.toContain('<label id="v-label"');
    expect(out).toContain('role="radiogroup" aria-labelledby="v-label"');
  });

  it('gibt disabled an Textarea und Select weiter', () => {
    expect(html(h(FormField, { label: 'X', disabled: true }, h(Textarea, {})))).toContain('disabled=""');
    expect(html(h(FormField, { label: 'X', disabled: true }, h(Select, { options: [] })))).toContain('disabled=""');
  });

  it('FormSection zeigt Titel und Beschreibung', () => {
    const out = html(h(FormSection, { title: 'Zugang', description: 'Wer sich anmeldet' }, 'x'));
    expect(out).toContain('<h3');
    expect(out).toContain('Wer sich anmeldet');
  });
});

describe('Textarea', () => {
  it('Default 3 Zeilen, mono optional', () => {
    expect(html(h(Textarea, {}))).toContain('rows="3"');
    expect(html(h(Textarea, { mono: true }))).toContain('font-mono');
  });
});

describe('Select', () => {
  it('rendert Optionen und Platzhalter', () => {
    const out = html(h(Select, { options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B', disabled: true }], placeholder: 'Bitte wählen', value: '', onChange: () => {} }));
    expect(out).toContain('<option value="" selected="">Bitte wählen</option>');
    expect(out).toContain('<option value="b" disabled="">B</option>');
    expect(out).toContain('appearance-none');
  });

  it('Platzhalter ist bei required ausgeblendet, aber nicht gesperrt (sonst springt ein ungesteuertes Select auf die erste Option)', () => {
    expect(html(h(Select, { options: [], placeholder: 'Bitte wählen', required: true }))).toContain('<option value="" hidden="">');
  });
});

describe('SearchInput', () => {
  it('zeigt „Suche leeren“ nur mit Inhalt und beansprucht dann Escape', () => {
    const empty = html(h(SearchInput, { value: '', onValueChange: () => {} }));
    expect(empty).not.toContain('Suche leeren');
    expect(empty).not.toContain('data-efa-escape');
    const full = html(h(SearchInput, { value: 'abc', onValueChange: () => {} }));
    expect(full).toContain('aria-label="Suche leeren"');
    expect(full).toContain('data-efa-escape="active"');
    expect(full).toContain('placeholder="Suchen …"');
  });
});

describe('Checkbox', () => {
  it('verknüpft Beschriftung und Erläuterung', () => {
    const out = html(h(Checkbox, { id: 'ok', checked: true, label: 'Ich stimme zu', description: 'AGB' }));
    expect(out).toContain('type="checkbox"');
    expect(out).toContain('for="ok"');
    expect(out).toContain('aria-describedby="ok-desc"');
    expect(out).toContain('checked=""');
  });

  it('meldet indeterminate als mixed und invalid', () => {
    const out = html(h(Checkbox, { checked: false, indeterminate: true, invalid: true, 'aria-label': 'Alle' }));
    expect(out).toContain('aria-checked="mixed"');
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain('aria-label="Alle"');
  });

  it('übernimmt im FormField id, Fehler und Beschreibung', () => {
    const out = html(h(FormField, { id: 'agb', label: 'Zustimmung', error: 'Bitte zustimmen' },
      h(Checkbox, { checked: false, label: 'Ich stimme zu' })));
    expect(out).toContain('for="agb"');
    expect(out).toContain('type="checkbox" id="agb"');
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain('aria-describedby="agb-error"');
  });

  it('CheckboxGroup im FormField: eindeutige ids, Fehler an jeder Checkbox', () => {
    const out = html(h(FormField, { id: 'st', label: 'Stufen', as: 'group', error: 'mind. eine' },
      h(CheckboxGroup, { options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], value: [], onValueChange: () => {} })));
    expect(out).not.toContain('id="st"');
    expect(out.match(/aria-invalid="true"/g)).toHaveLength(2);
    expect(out).toContain('role="group" aria-labelledby="st-label" aria-describedby="st-error"');
  });

  it('toggleChoice hält die Reihenfolge der Optionen und unbekannte Werte', () => {
    const opts = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }];
    expect(toggleChoice(opts, ['c'], 'a', true)).toEqual(['a', 'c']);
    expect(toggleChoice(opts, ['a', 'c'], 'a', false)).toEqual(['c']);
    expect(toggleChoice(opts, ['x', 'b'], 'a', true)).toEqual(['a', 'b', 'x']);
  });

  it('CheckboxGroup setzt name und Häkchen je Wert', () => {
    const out = html(h(CheckboxGroup, {
      options: [{ value: 'low', label: 'Niedrig' }, { value: 'high', label: 'Hoch' }],
      value: ['high'], onValueChange: () => {}, name: 'efforts', 'aria-label': 'Stufen',
    }));
    expect(out).toContain('role="group"');
    expect(out).toContain('aria-label="Stufen"');
    expect(out.match(/name="efforts"/g)).toHaveLength(2);
    expect(out.match(/checked=""/g)).toHaveLength(1);
  });
});

describe('RadioGroup', () => {
  it('teilt einen Namen und markiert die Auswahl', () => {
    const out = html(h(RadioGroup, {
      options: [{ value: 'a', label: 'A', description: 'erste' }, { value: 'b', label: 'B' }],
      value: 'b', onValueChange: () => {}, name: 'vis', 'aria-label': 'Sichtbarkeit',
    }));
    expect(out.match(/name="vis"/g)).toHaveLength(2);
    expect(out).toContain('name="vis" checked="" value="b"');
    expect(out).toContain('aria-describedby="vis-0-desc"');
  });
});

describe('SegmentedControl', () => {
  const opts = [{ value: 'list', label: 'Liste' }, { value: 'grid', label: 'Kacheln', disabled: true }, { value: 'map', label: 'Karte' }];

  it('nextSegment überspringt gesperrte und läuft rundum', () => {
    expect(nextSegment(opts, 'list', 'ArrowRight')).toBe('map');
    expect(nextSegment(opts, 'map', 'ArrowDown')).toBe('list');
    expect(nextSegment(opts, 'list', 'ArrowLeft')).toBe('map');
    expect(nextSegment(opts, 'map', 'Home')).toBe('list');
    expect(nextSegment(opts, 'list', 'End')).toBe('map');
    expect(nextSegment(opts, 'list', 'a')).toBeNull();
    expect(nextSegment([{ value: 'x', label: 'X', disabled: true }], 'x', 'Home')).toBeNull();
  });

  it('tabbableSegment: Auswahl, sonst der erste wählbare', () => {
    expect(tabbableSegment(opts, 'map')).toBe('map');
    expect(tabbableSegment(opts, '' as string)).toBe('list');
    expect(tabbableSegment(opts, 'grid')).toBe('list');
    const out = html(h(SegmentedControl, { options: opts, value: '', onValueChange: () => {}, 'aria-label': 'Ansicht' }));
    expect(out.match(/tabindex="0"/g)).toHaveLength(1);
  });

  it('nur die Auswahl ist per Tab erreichbar', () => {
    const out = html(h(SegmentedControl, { options: opts, value: 'map', onValueChange: () => {}, 'aria-label': 'Ansicht' }));
    expect(out).toContain('role="radiogroup"');
    expect(out.match(/tabindex="0"/g)).toHaveLength(1);
    expect(out).toContain('aria-checked="true" data-state="checked" tabindex="0"');
  });
});
