import { createContext, lazy, memo, Suspense, useContext, useId, useState } from 'react';
import { createPortal } from 'react-dom';
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
  return <CountContext.Provider value={count}>
    <main>
      <p className="eyebrow">RSBUILD × TANSTACK REDACT</p>
      <h1>Same components. Different runtime.</h1>
      <p>Hooks, context, controlled forms, lazy modules, portals and 1,000 keyed rows.</p>
      <section className="controls">
        <button data-testid="increment" onClick={() => setCount(value => value + 1)}>Increment</button>
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
