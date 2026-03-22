import { render, screen } from '@testing-library/react';
import App from './App';

test('renders AI dashboard', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /ai dashboard/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^send$/i })).toBeInTheDocument();
});
