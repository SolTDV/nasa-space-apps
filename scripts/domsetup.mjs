import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true, url: 'http://localhost/' });
const g = globalThis;
for (const k of ['window','document','navigator','HTMLElement','Element','Node','SVGElement','MutationObserver','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) {
  try { Object.defineProperty(g, k, { value: dom.window[k] ?? (k==='window'?dom.window:undefined), configurable: true, writable: true }); } catch {}
}
g.IS_REACT_ACT_ENVIRONMENT = true;
g.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
g.fetch = async () => { throw new Error('offline (test)'); };   // forces the fallback climate path

