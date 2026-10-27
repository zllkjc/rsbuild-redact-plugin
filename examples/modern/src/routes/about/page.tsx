import { Link } from '@modern-js/runtime/router';

export default function About() {
  return <main><h1>About this demo</h1><Link to="/" data-testid="home-link">Back to demo</Link></main>;
}
