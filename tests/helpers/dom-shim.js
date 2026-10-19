/**
 * tests/helpers/dom-shim.js
 * Just enough `document` for utils.el() so terminal.js's runCommand() can be
 * driven end-to-end from node:test. Output is read back as plain text.
 */
function makeNode(tag) {
  return {
    tag, className: "", innerHTML: "", children: [], nodeType: 1, attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener() {},
    append(...c) { this.children.push(...c); },
  };
}

export function installDomShim() {
  if (globalThis.document) return;
  globalThis.document = {
    createElement: makeNode,
    createTextNode: (t) => ({ nodeType: 3, text: String(t) }),
    querySelector: () => null,
  };
}

export const createContainer = () => makeNode("div");

const ENTITIES = { "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&amp;": "&" };

/** Everything printed so far, tags stripped and entities decoded. */
export function outputText(container) {
  return container.children
    .map((c) => c.innerHTML)
    .join("\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;|&gt;|&quot;|&#39;|&amp;/g, (m) => ENTITIES[m]);
}
