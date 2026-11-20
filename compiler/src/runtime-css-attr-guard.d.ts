// runtime-css-attr-guard.d.ts — type declarations for runtime-css-attr-guard.js (S479 carve-out 2; types gate).
// (`export declare` form so the file also transpiles as ordinary TS.)
// The implementation stays JavaScript (it is inlined verbatim into the client runtime); this file only
// describes its exports to the TypeScript checker. Keep in step.

export declare const _SCRML_CSS_URL_ATTRS: Set<string>;
export declare function _scrml_css_attr_value_admitted(text: string, perEntry: boolean): boolean;
export declare function _scrml_css_attr_set(el: unknown, name: string, value: unknown, target?: string): void;
export declare function _scrml_link_href_set(el: unknown, name: string, value: unknown): void;
export declare function _scrml_css_attr_html(tag: string, name: string, parts: unknown[], target?: string): string;
