export type Child = Node | string | number | null | undefined | false | Child[];

export type Props = {
  [key: string]: string | number | boolean | EventListener | null | undefined;
};

// Element builder. Text always goes through textContent/createTextNode, so
// untrusted strings (issuer, account names, error text) are never parsed as HTML.
export function h(
  tag: string,
  props: Props | null,
  ...children: Child[]
): HTMLElement {
  const el = document.createElement(tag);
  if (props) {
    for (const key of Object.keys(props)) {
      const value = props[key];
      if (value === null || value === undefined || value === false) {
        continue;
      }
      if (key.startsWith("on") && typeof value === "function") {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (key === "class") {
        el.className = String(value);
      } else if (key === "value" || key === "checked" || key === "disabled") {
        (el as unknown as Record<string, unknown>)[key] = value;
      } else {
        el.setAttribute(key, value === true ? "" : String(value));
      }
    }
  }
  append(el, children);
  return el;
}

function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    if (Array.isArray(child)) {
      append(parent, child);
    } else if (typeof child === "string" || typeof child === "number") {
      parent.appendChild(document.createTextNode(String(child)));
    } else {
      parent.appendChild(child);
    }
  }
}

export function mount(root: HTMLElement, ...children: Child[]): void {
  root.textContent = "";
  append(root, children);
}
