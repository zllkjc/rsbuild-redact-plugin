import { createContext, lazy, memo, Suspense, useContext, useEffect, useId, useLayoutEffect, useRef, useState, version } from 'react';
import { createPortal, flushSync } from 'react-dom';
import './style.css';

const CountContext = createContext(0);
const ContextCount = memo(() => <output data-testid="context-count">{useContext(CountContext)}</output>);
const LazyMessage = lazy(() => import('./LazyMessage'));
const initialRows = Array.from({ length: 1000 }, (_, id) => ({ id, label: `Row ${id}` }));

export default function App() {
  const [count, setCount] = useState(0);
  const [rows, setRows] = useState(initialRows);
  const [text, setText] = useState('');
  const [showLazy, setShowLazy] = useState(false);
  const [showPortal, setShowPortal] = useState(false);
  const inputId = useId();
  const clickStart = useRef(0);
  useLayoutEffect(() => {
    if (clickStart.current) {
      (window as any).__lastCommitMs = performance.now() - clickStart.current;
      clickStart.current = 0;
    }
  }, [count]);
  useEffect(() => {
    (window as any).__bench = {
      version,
      run(kind: 'counter' | 'reverse', iterations = 20) {
        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
          flushSync(() => kind === 'counter'
            ? setCount(value => value + 1)
            : setRows(value => [...value].reverse()));
        }
        return performance.now() - start;
      },
    };
    return () => { delete (window as any).__bench; };
  }, []);
  return <CountContext.Provider value={count}>
    <main>
      <p className="eyebrow">RSBUILD × TANSTACK REDACT</p>
      <h1>Same components. Different runtime.</h1>
      <p>Hooks, context, controlled forms, lazy modules, portals and 1,000 keyed rows.</p>
      <section className="controls">
        <button data-testid="increment" onClick={() => { clickStart.current = performance.now(); setCount(value => value + 1); }}>Increment</button>
        <strong data-testid="count">{count}</strong>
        <span>Context: <ContextCount /></span>
        <button data-testid="reverse" onClick={() => setRows(value => [...value].reverse())}>Reverse rows</button>
        <button data-testid="lazy" onClick={() => setShowLazy(true)}>Load module</button>
        <button data-testid="portal" onClick={() => setShowPortal(value => !value)}>Toggle portal</button>
      </section>
      <label htmlFor={inputId}>Controlled input</label>
      <input id={inputId} value={text} onChange={event => setText(event.target.value)} />
      <output data-testid="input-value">{text}</output>
      {showLazy && <Suspense fallback={<p>Loading…</p>}><LazyMessage /></Suspense>}
      {showPortal && createPortal(<aside data-testid="portal-content">Portal is working</aside>, document.body)}
      <ol data-testid="rows">{rows.map(row => <li key={row.id} data-row-id={row.id}>{row.label}</li>)}</ol>
    </main>
  </CountContext.Provider>;
}
