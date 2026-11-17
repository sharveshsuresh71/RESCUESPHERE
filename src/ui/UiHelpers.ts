export function createPanel(title: string, subtitle?: string): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'spatial-panel';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', title);

  const heading = document.createElement('h1');
  heading.textContent = title;
  panel.append(heading);

  if (subtitle) {
    const subheading = document.createElement('h2');
    subheading.textContent = subtitle;
    panel.append(subheading);
  }

  return panel;
}

export function createButton(
  label: string,
  onClick: () => void,
  variant: 'primary' | 'secondary' | 'danger' = 'secondary'
): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = variant;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

export function createActionRow(...buttons: HTMLElement[]): HTMLElement {
  const row = document.createElement('div');
  row.className = 'actions';
  row.append(...buttons);
  return row;
}

export function createParagraph(text: string): HTMLElement {
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  return paragraph;
}

export function createDisclaimer(text: string): HTMLElement {
  const element = document.createElement('div');
  element.className = 'disclaimer';
  element.setAttribute('role', 'note');
  element.textContent = text;
  return element;
}

export function createField(
  labelText: string,
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
): HTMLElement {
  const field = document.createElement('label');
  field.className = 'field';

  const label = document.createElement('span');
  label.textContent = labelText;
  field.append(label, control);
  return field;
}

export function createSelect(options: Array<{ value: string; label: string }>): HTMLSelectElement {
  const select = document.createElement('select');

  for (const option of options) {
    const element = document.createElement('option');
    element.value = option.value;
    element.textContent = option.label;
    select.append(element);
  }

  return select;
}
