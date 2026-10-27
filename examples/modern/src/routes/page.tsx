import { Link } from '@modern-js/runtime/router';
import App from '../../../shared/App';

export default function Page() {
  return <><nav><Link to="/about" data-testid="about-link">About this demo</Link></nav><App /></>;
}
